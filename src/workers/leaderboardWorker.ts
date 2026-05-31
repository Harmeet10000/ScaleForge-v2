/**
 * src/workers/leaderboardWorker.ts
 *
 * Background worker: processes leaderboard score events from RabbitMQ.
 *
 * Queue: "leaderboard.score.event"
 * Message format: LeaderboardScoreMessage (Effect Schema)
 *
 * On each message:
 *   1. Decode and validate message body
 *   2. Call LeaderboardService.recordEvent (updates Redis + Postgres + publishes WS delta)
 *   3. Ack on success
 *   4. On DLQ threshold: send to DLQ and ack
 *
 * Encoding: supports both msgpackr (production) and JSON (dev/migration).
 * The rabbitConsumer decodes to JSON string; decodeAuto handles both formats.
 *
 * Health: raw HTTP server on WORKER_HEALTH_PORT (default 9104)
 * Graceful shutdown: close-with-grace with 10s deadline
 */

import { Effect, ManagedRuntime, Queue, Schema, Result, Fiber, Layer } from "effect"
import closeWithGrace from "close-with-grace"
import { LeaderboardService, LeaderboardServiceLive } from "../app/features/leaderboard/leaderboardService.ts"
import { WebhookPublisher } from "../infra/webhooks/webhookPublisher.ts"
import { RabbitConsumerService, RabbitConsumerServiceLive } from "./shared/rabbitConsumer.ts"
import { DLQService, DLQServiceLive } from "./shared/dlqService.ts"
import { WorkerLayer } from "./shared/workerLayer.ts"
import { makeWorkerHealth } from "./shared/workerHealth.ts"
import { AppConfigLive } from "../core/config/configService.ts"
import { PostgresServiceLive } from "../infra/postgres/postgresService.ts"
import { RedisServiceLive } from "../infra/redis/redisService.ts"

// ── Message schema ─────────────────────────────────────────────────────────────

const LeaderboardScoreMessage = Schema.Struct({
  userId: Schema.String.check(Schema.isNonEmpty()),
  delta: Schema.Int,
  entityType: Schema.String.check(Schema.isNonEmpty()),
  entityId: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
})

type LeaderboardScoreMessage = Schema.Schema.Type<typeof LeaderboardScoreMessage>

const QUEUE_NAME = "leaderboard.score.event"
const WORKER_NAME = "leaderboard"
const PREFETCH = 10  // leaderboard events are cheap; higher concurrency is fine

// ── Message processor ──────────────────────────────────────────────────────────

const processMessage = (
  msg: LeaderboardScoreMessage,
  ack: () => Effect.Effect<void>,
  nack: () => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const svc = yield* LeaderboardService

    yield* svc.recordEvent({
      userId: msg.userId,
      delta: msg.delta,
      entityType: msg.entityType,
      ...(msg.entityId !== undefined ? { entityId: msg.entityId } : {}),
      ...(msg.metadata !== undefined ? { metadata: msg.metadata as Record<string, unknown> } : {}),
    })

    yield* ack()
    yield* Effect.flatMap(WebhookPublisher, p =>
      p.emit('leaderboard.score.updated', {
        userId: msg.userId,
        delta: msg.delta,
        entityType: msg.entityType,
        entityId: msg.entityId,
      })
    ).pipe(Effect.ignore)
    yield* Effect.log(
      `[leaderboard-worker] recorded event userId=${msg.userId} delta=${msg.delta} entity=${msg.entityType}`
    )
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError("[leaderboard-worker] failed to process message", cause)
        const dlq = yield* DLQService
        yield* dlq.publish({
          sourceQueue: QUEUE_NAME,
          workerName: WORKER_NAME,
          body: msg,
          reason: "Unhandled error processing leaderboard score event",
          attempts: 1,
          failedAt: new Date().toISOString(),
          errorDetail: String(cause),
        })
        yield* nack()
      })
    )
  )

// ── Worker loop ───────────────────────────────────────────────────────────────

const workerProgram = Effect.gen(function* () {
  const consumer = yield* RabbitConsumerService
  const health = makeWorkerHealth({
    port: Number(process.env["WORKER_HEALTH_PORT"] ?? 9104),
  })

  const server = yield* Effect.promise(() => health.start())
  yield* Effect.log(
    `[leaderboard-worker] health server on :${(server.address() as { port: number }).port}`
  )

  yield* Effect.addFinalizer(() =>
    Effect.promise(() => health.stop()).pipe(Effect.ignore)
  )

  const msgQueue = yield* consumer.consume({
    queue: QUEUE_NAME,
    prefetch: PREFETCH,
  })

  health.setReady(true)
  yield* Effect.log(`[leaderboard-worker] consuming from ${QUEUE_NAME}`)

  const activeFibers = new Set<Fiber.Fiber<void, never>>()

  yield* Effect.forever(
    Effect.gen(function* () {
      const msg = yield* Queue.take(msgQueue)
      const decoded = Schema.decodeUnknownResult(LeaderboardScoreMessage)(msg.body)

      if (!Result.isSuccess(decoded)) {
        yield* Effect.logWarning(
          `[leaderboard-worker] invalid message schema — nacking`,
          decoded.failure,
        )
        yield* msg.nack()
        return
      }

      const job = decoded.success

      const fiber = yield* Effect.forkChild(
        processMessage(job, msg.ack, msg.nack).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("[leaderboard-worker] unhandled fiber error", cause)
          ),
        )
      )

      activeFibers.add(fiber)
      void Fiber.await(fiber).pipe(
        Effect.map(() => activeFibers.delete(fiber)),
        Effect.runFork,
      )
    })
  )
})

// ── Entry point ───────────────────────────────────────────────────────────────

const LeaderboardWorkerLayer = Layer.mergeAll(
  WorkerLayer,
  RabbitConsumerServiceLive.pipe(Layer.provide(AppConfigLive)),
  DLQServiceLive.pipe(Layer.provide(AppConfigLive)),
  // LeaderboardService needs Postgres + Redis, both present in WorkerLayer
  LeaderboardServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        PostgresServiceLive.pipe(Layer.provide(AppConfigLive)),
        RedisServiceLive.pipe(Layer.provide(AppConfigLive)),
      )
    )
  ),
)

const runtime = ManagedRuntime.make(LeaderboardWorkerLayer)

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    console.error("[leaderboard-worker] unexpected error — shutting down:", err)
  } else {
    console.log(`[leaderboard-worker] received ${signal ?? "close"}, shutting down…`)
  }
  await runtime.dispose()
})

runtime.runFork(
  workerProgram.pipe(
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        console.error("[leaderboard-worker] fatal error", cause)
        process.exit(1)
      }),
    ),
  ),
)
