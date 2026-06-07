/**
 * src/workers/cdcWorker.ts
 *
 * Change-Data-Capture worker (v2 — Effect-based).
 *
 * Two complementary capture strategies run concurrently:
 *
 *   1. MongoWatcherService
 *      – Opens a MongoDB change stream on the `users`, `subscriptions`, and
 *        `notifications` collections (requires replica set or Atlas).
 *      – Bridges change events into a `Queue.dropping(1000)` buffer.
 *      – Processes the queue with `Stream.debounce("500 millis")` to coalesce
 *        rapid bursts (e.g. bulk imports) before emitting webhook domain events.
 *      – Dedup via an LRU-style Map<docId, timestamp>: skips events for the
 *        same document emitted within a 30-second window.
 *
 *   2. PgPollerService
 *      – Polls the PostgreSQL `users` table every 10 seconds for rows where
 *        `updated_at > lastPollTime`.  Handles the case where MongoDB is not
 *        in use or the application wrote directly to Postgres without going
 *        through the Mongo layer.
 *      – Emits `user.updated` domain events via WebhookPublisher.
 *
 * Domain events emitted (feed into WebhookPublisher → RabbitMQ → delivery):
 *   user.updated          – MongoDB users / PG users
 *   subscription.updated  – MongoDB subscriptions
 *   notification.delivered – MongoDB notifications
 *
 * Health check: http://0.0.0.0:9105/health  (liveness)
 *               http://0.0.0.0:9105/ready   (readiness — true once streams open)
 */

import { Effect, Layer, ManagedRuntime, Queue, Stream, Schedule, Context } from "effect"
import { gt } from "drizzle-orm"
import closeWithGrace from "close-with-grace"
import { MongoService, MongoServiceLive } from "../infra/mongo/mongoService.ts"
import { PostgresService } from "../infra/postgres/postgresService.ts"
import { WebhookPublisher, WebhookPublisherLive } from "../infra/webhooks/webhookPublisher.ts"
import { WorkerLayer } from "./shared/workerLayer.ts"
import { makeWorkerHealth } from "./shared/workerHealth.ts"
import { PinoLoggerLayer } from "../infra/logger/pinoLogger.ts"
import { AppConfigLive } from "../core/config/configService.ts"
import { users } from "../db/schema/userSchema.ts"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MongoChangeDoc {
  /** The collection that triggered the change */
  collection: string
  /** The full document (or null for delete events) */
  document: Record<string, unknown> | null
  /** The changed document id (string form of ObjectId) */
  documentId: string
  /** Change operation type */
  operationType: "insert" | "update" | "replace" | "delete"
}

// ── Dedup cache ────────────────────────────────────────────────────────────────
// LRU-style map: documentId → last-emitted timestamp (ms).
// Entries expire after DEDUP_TTL_MS; map is capped at DEDUP_MAX_SIZE entries.

const DEDUP_TTL_MS = 30_000
const DEDUP_MAX_SIZE = 5_000

const makeDedup = () => {
  const cache = new Map<string, number>()

  const shouldProcess = (id: string): boolean => {
    const now = Date.now()
    const last = cache.get(id)
    if (last !== undefined && now - last < DEDUP_TTL_MS) {
      return false
    }
    // Evict oldest entries when over the size limit
    if (cache.size >= DEDUP_MAX_SIZE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(id, now)
    return true
  }

  return { shouldProcess }
}

// ── MongoWatcherService ────────────────────────────────────────────────────────

const WATCHED_COLLECTIONS: Record<string, string> = {
  users: "user.updated",
  subscriptions: "subscription.updated",
  notifications: "notification.delivered",
}

interface MongoWatcherService {
  readonly start: () => Effect.Effect<void>
}

const MongoWatcherService = Context.Service<MongoWatcherService>("@workers/MongoWatcherService")

const MongoWatcherServiceLive = Layer.effect(
  MongoWatcherService,
  Effect.gen(function* () {
    const mongo = yield* MongoService
    const publisher = yield* WebhookPublisher
    const dedup = makeDedup()

    const start = () =>
      Effect.gen(function* () {
        const changeQueue = yield* Queue.dropping<MongoChangeDoc>(1_000)

        // Open a database-level change stream that captures all collections
        const changeStream = mongo.connection.watch([], { fullDocument: "updateLookup" })

        // Bridge EventEmitter → Effect Queue synchronously.
        // Callbacks use Effect.runFork(Queue.offer(...)) to push without blocking.
        yield* Effect.sync(() => {
          changeStream.on("change", (change: unknown) => {
            const doc = change as {
              ns?: { coll?: string }
              fullDocument?: Record<string, unknown> | null
              documentKey?: { _id?: unknown }
              operationType?: string
            }

            const collection = doc.ns?.coll ?? ""
            if (!Object.hasOwn(WATCHED_COLLECTIONS, collection)) return

            const documentId = String(doc.documentKey?._id ?? "")
            const operationType = (doc.operationType ?? "update") as MongoChangeDoc["operationType"]

            void Effect.runFork(
              Queue.offer(changeQueue, {
                collection,
                document: (doc.fullDocument as Record<string, unknown>) ?? null,
                documentId,
                operationType,
              }),
            )
          })

          changeStream.on("error", (err: Error) => {
            void Effect.runFork(
              Effect.logError("[cdc-worker] mongo change stream error", err).pipe(
                Effect.provide(PinoLoggerLayer),
              ),
            )
          })
        })

        // Process buffered changes with 500ms debounce
        yield* Stream.fromQueue(changeQueue).pipe(
          Stream.debounce("500 millis"),
          Stream.runForEach((change) =>
            Effect.gen(function* () {
              const eventName = WATCHED_COLLECTIONS[change.collection]
              if (!eventName) return
              if (!dedup.shouldProcess(change.documentId)) return

              yield* publisher
                .emit(eventName, {
                  documentId: change.documentId,
                  collection: change.collection,
                  operationType: change.operationType,
                  document: change.document,
                  source: "mongo-cdc",
                })
                .pipe(Effect.ignore)
            }),
          ),
        )
      })

    return MongoWatcherService.of({ start })
  }),
)

// ── PgPollerService ────────────────────────────────────────────────────────────

const PG_POLL_INTERVAL = "10 seconds"
const PG_POLL_BATCH = 200

interface PgPollerService {
  readonly start: () => Effect.Effect<void>
}

const PgPollerService = Context.Service<PgPollerService>("@workers/PgPollerService")

const PgPollerServiceLive = Layer.effect(
  PgPollerService,
  Effect.gen(function* () {
    const pg = yield* PostgresService
    const publisher = yield* WebhookPublisher
    const dedup = makeDedup()

    let lastPollTime = new Date(Date.now() - 60_000) // seed with 1-minute lookback

    const poll = Effect.gen(function* () {
      const cutoff = lastPollTime
      lastPollTime = new Date()

      const rowsOption = yield* Effect.tryPromise({
        try: () =>
          pg.db
            .select({ id: users.id, name: users.name, emailAddress: users.emailAddress, updatedAt: users.updatedAt })
            .from(users)
            .where(gt(users.updatedAt, cutoff))
            .limit(PG_POLL_BATCH),
        catch: (err) => err,
      }).pipe(
        Effect.tapError((err) => Effect.logError("[cdc-worker] pg poll error", err)),
        Effect.option,
      )

      if (rowsOption._tag === "None") return
      const rows = rowsOption.value

      for (const row of rows) {
        if (!dedup.shouldProcess(row.id)) continue

        yield* publisher
          .emit("user.updated", {
            userId: row.id,
            name: row.name,
            emailAddress: row.emailAddress,
            updatedAt: row.updatedAt,
            source: "pg-poll",
          })
          .pipe(Effect.ignore)
      }
    })

    const start = () =>
      Effect.repeat(poll, Schedule.fixed(PG_POLL_INTERVAL)).pipe(
        Effect.catchCause((cause) => Effect.logError("[cdc-worker] pg poller fatal", cause)),
        Effect.asVoid,
      )

    return PgPollerService.of({ start })
  }),
)

// ── Orchestrator program ───────────────────────────────────────────────────────

const cdcProgram = Effect.gen(function* () {
  const mongoWatcher = yield* MongoWatcherService
  const pgPoller = yield* PgPollerService

  yield* Effect.log("[cdc-worker] starting CDC worker…")

  // Run both strategies concurrently — if one fails it logs and stops, the
  // other continues independently.
  yield* Effect.all(
    [
      mongoWatcher.start().pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("[cdc-worker] mongo watcher stopped", { cause }),
        ),
      ),
      pgPoller.start().pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("[cdc-worker] pg poller stopped", { cause }),
        ),
      ),
    ],
    { concurrency: "unbounded" },
  )
})

// ── Layer assembly ─────────────────────────────────────────────────────────────

// WorkerLayer already includes Postgres + RabbitMQ needed by WebhookPublisher
const MongoLayer = MongoServiceLive.pipe(Layer.provide(AppConfigLive))

// WebhookPublisher needs Postgres + RabbitMQ (both in WorkerLayer)
const WebhookPublisherLayer = WebhookPublisherLive.pipe(
  Layer.provide(WorkerLayer),
)

// Watcher + poller each need their respective services and publisher
const MongoWatcherLayer = MongoWatcherServiceLive.pipe(
  Layer.provide(Layer.merge(MongoLayer, WebhookPublisherLayer)),
)

const PgPollerLayer = PgPollerServiceLive.pipe(
  Layer.provide(Layer.merge(WorkerLayer, WebhookPublisherLayer)),
)

const CdcWorkerRootLayer = Layer.mergeAll(
  WorkerLayer,
  MongoLayer,
  WebhookPublisherLayer,
  MongoWatcherLayer,
  PgPollerLayer,
) as unknown as Layer.Layer<MongoWatcherService | PgPollerService, never, never>

// ── Entry point ────────────────────────────────────────────────────────────────

const health = makeWorkerHealth({ port: Number(process.env['WORKER_HEALTH_PORT'] ?? 9105) })

const runtime = ManagedRuntime.make(CdcWorkerRootLayer)

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    void Effect.runFork(
      Effect.logError("[cdc-worker] unexpected error — shutting down", err).pipe(
        Effect.provide(PinoLoggerLayer),
      ),
    )
  } else {
    void Effect.runFork(
      Effect.log(`[cdc-worker] received ${signal ?? "close"}, shutting down…`).pipe(
        Effect.provide(PinoLoggerLayer),
      ),
    )
  }
  health.setReady(false)
  await health.stop()
  await runtime.dispose()
})

void health.start().then(() => {
  health.setReady(true)
})

runtime.runFork(
  cdcProgram.pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError("[cdc-worker] fatal", cause)
        yield* Effect.sync(() => process.exit(1))
      }),
    ),
  ),
)
