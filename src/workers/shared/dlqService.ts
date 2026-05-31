/**
 * src/workers/shared/dlqService.ts
 *
 * Dead-Letter Queue (DLQ) publisher.
 *
 * When a worker exhausts its retry budget it calls `DLQService.publish`.
 * The message lands on the `dead.letter` exchange with x-death headers
 * describing original queue, failure reason, and attempt count.
 * Ops can inspect or replay DLQ messages via the RabbitMQ management UI.
 *
 * Exchange topology (bootstrapped on first publish):
 *   dead.letter (topic, durable) → dead.letter.<worker> queue
 */

import { Context, Effect, Layer } from "effect"
import amqplib from "amqplib"
import type { Channel, ChannelModel } from "amqplib"
import { AppConfig } from "../../core/config/configService.ts"
import { RabbitMQConnectionError, RabbitMQPublishError } from "../../core/errors/infraErrors.ts"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DLQMessage {
  /** Original queue the message came from */
  readonly sourceQueue: string
  /** Worker name for routing (e.g. "webhook-delivery", "pdf-receipt", "email") */
  readonly workerName: string
  /** Original message body (already decoded) */
  readonly body: unknown
  /** Human-readable failure reason */
  readonly reason: string
  /** Number of delivery attempts made */
  readonly attempts: number
  /** ISO timestamp of last failure */
  readonly failedAt: string
  /** Optional serialized error for debugging */
  readonly errorDetail?: string
}

export interface DLQService {
  readonly publish: (msg: DLQMessage) => Effect.Effect<void, RabbitMQPublishError>
}

export const DLQService = Context.Service<DLQService>("@infra/DLQService")

// ── Implementation ────────────────────────────────────────────────────────────

const DLQ_EXCHANGE = "dead.letter"

const openChannel = (url: string): Effect.Effect<{ conn: ChannelModel; ch: Channel }, RabbitMQConnectionError> =>
  Effect.tryPromise({
    try: async () => {
      const conn = await amqplib.connect(url)
      const ch = await conn.createChannel()
      await ch.assertExchange(DLQ_EXCHANGE, "topic", { durable: true })
      return { conn, ch }
    },
    catch: (error) => new RabbitMQConnectionError({ cause: error }),
  })

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  // Dedicated connection for DLQ publishing; acquired for the layer lifetime.
  const { ch } = yield* Effect.acquireRelease(
    openChannel(config.rabbitmq.url),
    ({ conn }) =>
      Effect.tryPromise({
        try: () => conn.close(),
        catch: () => void 0,
      }).pipe(Effect.ignore),
  )

  return DLQService.of({
    publish: (msg) =>
      Effect.gen(function* () {
        const routingKey = `dead.${msg.workerName}`
        const payload = Buffer.from(
          JSON.stringify({
            ...msg,
            _dlq: true,
          }),
        )

        yield* Effect.tryPromise({
          try: async () => {
            // Ensure the worker-specific DLQ queue exists.
            await ch.assertQueue(`dead.letter.${msg.workerName}`, {
              durable: true,
              arguments: {
                "x-message-ttl": 7 * 24 * 60 * 60 * 1000, // 7 days TTL
              },
            })
            await ch.bindQueue(
              `dead.letter.${msg.workerName}`,
              DLQ_EXCHANGE,
              routingKey,
            )

            const ok = ch.publish(DLQ_EXCHANGE, routingKey, payload, {
              persistent: true,
              headers: {
                "x-source-queue": msg.sourceQueue,
                "x-worker": msg.workerName,
                "x-attempts": msg.attempts,
                "x-failed-at": msg.failedAt,
              },
            })
            if (!ok) throw new Error("DLQ channel write buffer full")
          },
          catch: (error) =>
            new RabbitMQPublishError({
              exchange: DLQ_EXCHANGE,
              routingKey,
              cause: error,
            }),
        })

        yield* Effect.log(`[DLQ] Published to dead.letter.${msg.workerName}: ${msg.reason}`)
      }),
  })
})

export const DLQServiceLive = Layer.effect(DLQService, make)
