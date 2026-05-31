/**
 * src/workers/emailWorker.ts
 *
 * Email dispatch worker.
 *
 * Message flow:
 *   RabbitMQ "email.send" queue
 *     → decode & validate with Effect Schema
 *     → EmailService.send (Resend API)
 *     → ack on success
 *     → nack → DLQ after MAX_ATTEMPTS
 *
 * Rate consideration: Resend free tier = 100 emails/day; production should
 * throttle via `bottleneck` or check plan limits. Prefetch=2 is conservative.
 */

import { Effect, ManagedRuntime, Queue, Schema, Layer } from "effect"
import closeWithGrace from "close-with-grace"
import { EmailService } from "../infra/email/emailService.ts"
import { DLQService, DLQServiceLive } from "./shared/dlqService.ts"
import { RabbitConsumerService, RabbitConsumerServiceLive } from "./shared/rabbitConsumer.ts"
import { WorkerLayer } from "./shared/workerLayer.ts"
import { makeWorkerHealth } from "./shared/workerHealth.ts"
import { AppConfigLive } from "../core/config/configService.ts"

// ── Job schema ─────────────────────────────────────────────────────────────────

const EmailJobSchema = Schema.Struct({
  to: Schema.Array(Schema.String.check(Schema.nonEmpty())),
  subject: Schema.String.check(Schema.nonEmpty()),
  html: Schema.String.check(Schema.nonEmpty()),
  from: Schema.optionalKey(Schema.String),
  attempt: Schema.Number.pipe(Schema.int(), Schema.between(0, 5)),
})

type EmailJob = Schema.Schema.Type<typeof EmailJobSchema>

const QUEUE_NAME = "email.send"
const WORKER_NAME = "email"
const MAX_ATTEMPTS = 3
const PREFETCH = 2

// ── Message processor ─────────────────────────────────────────────────────────

const processJob = (
  job: EmailJob,
  ack: () => Effect.Effect<void>,
  nack: () => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const email = yield* EmailService
    const dlq = yield* DLQService

    const result = yield* email.send({
      to: job.to,
      subject: job.subject,
      html: job.html,
      from: job.from,
    }).pipe(
      Effect.map(() => ({ ok: true as const })),
      Effect.catchAll((err) => Effect.succeed({ ok: false as const, error: err })),
    )

    if (result.ok) {
      yield* ack()
      yield* Effect.log(`[email-worker] sent to ${job.to.join(",")} — "${job.subject}"`)
      return
    }

    const nextAttempt = job.attempt + 1

    if (nextAttempt >= MAX_ATTEMPTS) {
      yield* dlq.publish({
        sourceQueue: QUEUE_NAME,
        workerName: WORKER_NAME,
        body: job,
        reason: `Email send failed after ${MAX_ATTEMPTS} attempts`,
        attempts: nextAttempt,
        failedAt: new Date().toISOString(),
        errorDetail: String(result.error),
      })
      yield* ack()
      yield* Effect.logWarning(`[email-worker] exhausted retries for "${job.subject}" → DLQ`)
    } else {
      yield* nack()
      yield* Effect.logWarning(`[email-worker] retry ${nextAttempt}/${MAX_ATTEMPTS} for "${job.subject}"`)
    }
  }).pipe(
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError(`[email-worker] unhandled failure`, cause)
        yield* nack()
      }),
    ),
  )

// ── Worker loop ───────────────────────────────────────────────────────────────

const workerProgram = Effect.gen(function* () {
  const consumer = yield* RabbitConsumerService
  const health = makeWorkerHealth({
    port: Number(process.env["WORKER_HEALTH_PORT"] ?? 9103),
  })

  yield* Effect.promise(() => health.start())
  yield* Effect.addFinalizer(() => Effect.promise(() => health.stop()).pipe(Effect.ignoreLogged))

  const msgQueue = yield* consumer.consume({ queue: QUEUE_NAME, prefetch: PREFETCH })
  health.setReady(true)
  yield* Effect.log(`[email-worker] consuming from ${QUEUE_NAME}`)

  yield* Effect.forever(
    Effect.gen(function* () {
      const msg = yield* Queue.take(msgQueue)
      const decoded = Schema.decodeUnknownResult(EmailJobSchema)(msg.body)

      if (!decoded.success) {
        yield* Effect.logWarning(`[email-worker] invalid job schema`)
        yield* msg.nack()
        return
      }

      // Process sequentially (PREFETCH=2 keeps rate down; fork for true concurrency)
      yield* processJob(decoded.value, msg.ack, msg.nack)
    }),
  )
})

// ── Entry point ───────────────────────────────────────────────────────────────

const WorkerRootLayer = Layer.mergeAll(
  WorkerLayer,
  RabbitConsumerServiceLive.pipe(Layer.provide(AppConfigLive)),
  DLQServiceLive.pipe(Layer.provide(AppConfigLive)),
)

const runtime = ManagedRuntime.make(WorkerRootLayer)

// close-with-grace handles SIGTERM + SIGINT + unhandledRejection and gives a
// 10 s deadline to drain in-flight emails before force-killing the process.
closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    console.error("[email-worker] unexpected error — shutting down:", err)
  } else {
    console.log(`[email-worker] received ${signal ?? "close"}, shutting down…`)
  }
  await Effect.runPromise(runtime.dispose())
})

Effect.runFork(
  runtime.runFork(
    workerProgram.pipe(
      Effect.scoped,
      Effect.catchAllCause((cause) =>
        Effect.sync(() => {
          console.error("[email-worker] fatal", cause)
          process.exit(1)
        }),
      ),
    ),
  ),
)
