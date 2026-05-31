/**
 * src/workers/webhookDeliveryWorker.ts
 *
 * Production-grade webhook delivery worker.
 *
 * Message flow:
 *   RabbitMQ "webhooks.deliver" queue
 *     → decode & validate with Effect Schema
 *     → deliverWebhook (HTTPS POST with HMAC-SHA256 signature)
 *       ✓ success → update delivery status=delivered, ack
 *       ✗ failure (attempt < MAX) → update nextAttemptAt, nack (DLX requeue with delay)
 *       ✗ failure (attempt >= MAX) → DLQService.publish, update status=failed, ack
 *
 * Concurrency: `prefetch=5` → up to 5 in-flight deliveries concurrently.
 * Each message is processed in its own forked fiber for isolation.
 *
 * Queue topology (declared by worker at startup):
 *   webhooks.deliver (durable, x-dead-letter-exchange=webhooks.retry)
 *   webhooks.retry (topic, durable) → webhooks.delay.{N}s queues with per-queue TTL
 *
 * This worker does NOT own the RabbitMQService from appLayer; it creates its own
 * consumer channel via RabbitConsumerService (separate connection per worker process).
 */

import { Effect, ManagedRuntime, Queue, Schema, Result, Fiber, Layer } from "effect"
import closeWithGrace from "close-with-grace"
import { eq, sql } from "drizzle-orm"
import { PostgresService } from "../infra/postgres/postgresService.ts"
import { MetricsService } from "../infra/telemetry/metricsService.ts"
import { DLQService, DLQServiceLive } from "./shared/dlqService.ts"
import { RabbitConsumerService, RabbitConsumerServiceLive } from "./shared/rabbitConsumer.ts"
import { WorkerLayer } from "./shared/workerLayer.ts"
import { makeWorkerHealth } from "./shared/workerHealth.ts"
import { deliverWebhook, MAX_ATTEMPTS, nextRetryDelaySecs } from "./webhookWorker.ts"
import { webhookDeliveries } from "../db/schema/webhookSchema.ts"
import { AppConfigLive } from "../core/config/configService.ts"

// ── Job schema ─────────────────────────────────────────────────────────────────

const WebhookJobSchema = Schema.Struct({
  deliveryId: Schema.String,
  subscriptionId: Schema.String,
  event: Schema.String,
  payload: Schema.Unknown,
  secret: Schema.String,
  url: Schema.String.check(Schema.isNonEmpty()),
  attempt: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_ATTEMPTS })),
})

type WebhookJob = Schema.Schema.Type<typeof WebhookJobSchema>

const QUEUE_NAME = "webhooks.deliver"
const WORKER_NAME = "webhook-delivery"
const PREFETCH = 5

// ── DB helpers ─────────────────────────────────────────────────────────────────

const markDelivered = (deliveryId: string, statusCode: number) =>
  Effect.gen(function* () {
    const { db } = yield* PostgresService
    yield* Effect.tryPromise({
      try: () =>
        db
          .update(webhookDeliveries)
          .set({
            status: "delivered",
            statusCode,
            lastAttemptAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, deliveryId)),
      catch: (e) => e,
    }).pipe(Effect.ignore)
  })

const markFailed = (deliveryId: string, statusCode: number | null, attempt: number) =>
  Effect.gen(function* () {
    const { db } = yield* PostgresService
    const nextDelaySecs = nextRetryDelaySecs(attempt)
    const nextAttempt = attempt < MAX_ATTEMPTS - 1
      ? new Date(Date.now() + nextDelaySecs * 1000)
      : null

    yield* Effect.tryPromise({
      try: () =>
        db
          .update(webhookDeliveries)
          .set({
            status: attempt >= MAX_ATTEMPTS - 1 ? "failed" : "pending",
            statusCode,
            attempts: sql`${webhookDeliveries.attempts} + 1`,
            lastAttemptAt: new Date(),
            nextAttemptAt: nextAttempt,
          })
          .where(eq(webhookDeliveries.id, deliveryId)),
      catch: (e) => e,
    }).pipe(Effect.ignore)
  })

// ── Message processor ─────────────────────────────────────────────────────────

const processMessage = (job: WebhookJob, ack: () => Effect.Effect<void>, nack: () => Effect.Effect<void>) =>
  Effect.gen(function* () {
    const metrics = yield* MetricsService

    const result = yield* deliverWebhook(job).pipe(
      Effect.map((statusCode) => ({ ok: true as const, statusCode })),
      Effect.matchEffect({
        onSuccess: (r) => Effect.succeed(r),
        onFailure: (err) => Effect.succeed({ ok: false as const, error: err }),
      }),
    )

    if (result.ok) {
      metrics.messagesPublished.inc({ exchange: "webhooks", routing_key: "delivered" })
      yield* markDelivered(job.deliveryId, result.statusCode)
      yield* ack()
      yield* Effect.log(`[webhook-worker] delivered ${job.deliveryId} attempt=${job.attempt}`)
      return
    }

    // Delivery failed
    const nextAttempt = job.attempt + 1

    if (nextAttempt >= MAX_ATTEMPTS) {
      // Exhausted — send to DLQ
      const dlq = yield* DLQService
      yield* dlq.publish({
        sourceQueue: QUEUE_NAME,
        workerName: WORKER_NAME,
        body: job,
        reason: `Exhausted ${MAX_ATTEMPTS} delivery attempts for ${job.url}`,
        attempts: nextAttempt,
        failedAt: new Date().toISOString(),
        errorDetail: String(result.error),
      })
      yield* markFailed(job.deliveryId, null, nextAttempt)
      yield* ack() // ack so it doesn't bounce back from RabbitMQ
      yield* Effect.logWarning(`[webhook-worker] exhausted ${job.deliveryId} → DLQ`)
    } else {
      // More retries left — nack with requeue=false so DLX + TTL handles delay
      yield* markFailed(job.deliveryId, null, nextAttempt)
      yield* nack()
      yield* Effect.log(
        `[webhook-worker] retry ${nextAttempt}/${MAX_ATTEMPTS} for ${job.deliveryId} in ${nextRetryDelaySecs(nextAttempt)}s`,
      )
    }
  })

// ── Worker loop ───────────────────────────────────────────────────────────────

const workerProgram = Effect.gen(function* () {
  const consumer = yield* RabbitConsumerService
  const health = makeWorkerHealth({
    port: Number(process.env["WORKER_HEALTH_PORT"] ?? 9101),
  })

  const server = yield* Effect.promise(() => health.start())
  yield* Effect.log(`[webhook-worker] health server on :${(server.address() as { port: number }).port}`)

  yield* Effect.addFinalizer(() =>
    Effect.promise(() => health.stop()).pipe(Effect.ignore),
  )

  // Create the consumer queue (scoped to this Effect's scope)
  const msgQueue = yield* consumer.consume({
    queue: QUEUE_NAME,
    prefetch: PREFETCH,
  })

  health.setReady(true)
  yield* Effect.log(`[webhook-worker] consuming from ${QUEUE_NAME}`)

  // Drain messages forever; each message is processed in an isolated fiber.
  const activeFibers = new Set<Fiber.Fiber<void, never>>()

  yield* Effect.forever(
    Effect.gen(function* () {
      const msg = yield* Queue.take(msgQueue)
      const decoded = Schema.decodeUnknownResult(WebhookJobSchema)(msg.body)

      if (Result.isFailure(decoded)) {
        yield* Effect.logWarning(`[webhook-worker] invalid job schema — nacking`, decoded.failure)
        yield* msg.nack()
        return
      }

      const job = decoded.success

      // Fork processing so we don't block the consumer loop.
      const fiber = yield* Effect.forkScoped(
        processMessage(job, msg.ack, msg.nack).pipe(
          Effect.catchCause((cause) =>
            Effect.logError(`[webhook-worker] unhandled error in fiber`, cause),
          ),
        ),
      )

      activeFibers.add(fiber)
      void Fiber.await(fiber).pipe(
        Effect.map(() => activeFibers.delete(fiber)),
        Effect.runFork,
      )
    }),
  )
})

// ── Entry point ───────────────────────────────────────────────────────────────

const WorkerRootLayer = Layer.mergeAll(
  WorkerLayer,
  RabbitConsumerServiceLive.pipe(Layer.provide(AppConfigLive)),
  DLQServiceLive.pipe(Layer.provide(AppConfigLive)),
) as unknown as Layer.Layer<RabbitConsumerService | DLQService, never, never>

const runtime = ManagedRuntime.make(WorkerRootLayer)

// close-with-grace handles SIGTERM + SIGINT + unhandledRejection and gives a
// 10 s deadline to drain in-flight deliveries before force-killing the process.
closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    console.error("[webhook-worker] unexpected error — shutting down:", err)
  } else {
    console.log(`[webhook-worker] received ${signal ?? "close"}, shutting down…`)
  }
  await runtime.dispose()
})

runtime.runFork(
  workerProgram.pipe(
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        console.error("[webhook-worker] fatal error", cause)
        process.exit(1)
      }),
    ),
  ),
)
