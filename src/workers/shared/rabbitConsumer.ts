/**
 * src/workers/shared/rabbitConsumer.ts
 *
 * Typed amqplib → Effect Queue bridge.
 *
 * Design rationale:
 * - amqplib uses callbacks/EventEmitters; we bridge to Effect via Queue.
 * - A separate `Channel` is created for consuming (never share publish/consume channels).
 * - `prefetch` = concurrency limit: RabbitMQ won't push more msgs until we ack/nack.
 * - The consumer loop runs in a Fiber started by `Effect.forkScoped`; when the
 *   scope closes (worker shutdown), the fiber is interrupted and the channel closed.
 * - `nack(requeue=false)` + DLQ is the failure path: never requeue to the same queue
 *   (causes hot-loop); let DLQService handle republishing to dead.letter exchange.
 */

import { Context, Effect, Layer, Queue, Scope } from "effect"
import type { Channel, ConsumeMessage, Connection } from "amqplib"
import amqplib from "amqplib"
import { AppConfig } from "../../core/config/configService.ts"
import { RabbitMQConnectionError } from "../../core/errors/infraErrors.ts"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AckedMessage {
  /** Raw message body as a parsed unknown value (caller must validate with Schema) */
  readonly body: unknown
  /** Ack — remove from queue */
  readonly ack: () => Effect.Effect<void>
  /** Nack without requeue — sends to DLQ via exchange binding */
  readonly nack: () => Effect.Effect<void>
  /** Raw headers for tracing propagation */
  readonly headers: Record<string, unknown>
  /** Delivery tag (internal amqplib identifier) */
  readonly deliveryTag: number
}

export interface ConsumeOptions {
  readonly queue: string
  /** Max unacked messages in-flight (== worker concurrency). Default: 5 */
  readonly prefetch?: number
  /** Auto-ack mode (no manual ack/nack). Use only for fire-and-forget. Default: false */
  readonly autoAck?: boolean
}

export interface RabbitConsumerService {
  /**
   * Returns a scoped Effect.Queue that drains RabbitMQ messages.
   * The queue is bounded to `prefetch` capacity — back-pressure is applied automatically.
   * Callers MUST call ack() or nack() on every message.
   */
  readonly consume: (
    opts: ConsumeOptions,
  ) => Effect.Effect<Queue.Dequeue<AckedMessage>, RabbitMQConnectionError, Scope.Scope>
}

export const RabbitConsumerService = Context.Service<RabbitConsumerService>(
  "@infra/RabbitConsumerService",
)

// ── Implementation ────────────────────────────────────────────────────────────

const connectConsumerChannel = (url: string): Effect.Effect<{ conn: Connection; ch: Channel }, RabbitMQConnectionError> =>
  Effect.tryPromise({
    try: async () => {
      const conn = await amqplib.connect(url)
      const ch = await conn.createChannel()
      return { conn, ch }
    },
    catch: (error) => new RabbitMQConnectionError({ cause: error }),
  })

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  return RabbitConsumerService.of({
    consume: (opts) =>
      Effect.gen(function* () {
        const prefetch = opts.prefetch ?? 5
        const autoAck = opts.autoAck ?? false

        // Create a dedicated consume connection+channel; acquire in current scope.
        const { conn, ch } = yield* Effect.acquireRelease(
          connectConsumerChannel(config.rabbitmq.url),
          ({ conn }) =>
            Effect.tryPromise({
              try: () => conn.close(),
              catch: () => void 0,
            }).pipe(Effect.ignoreLogged),
        )

        yield* Effect.tryPromise({
          try: () =>
            Promise.all([
              ch.prefetch(prefetch),
              ch.assertQueue(opts.queue, { durable: true }),
            ]),
          catch: (error) => new RabbitMQConnectionError({ cause: error }),
        })

        // Bounded queue — capacity = prefetch; amqplib won't push more until we drain.
        const q = yield* Queue.bounded<AckedMessage>(prefetch * 2)

        // Forward amqplib messages into the Effect Queue.
        yield* Effect.tryPromise({
          try: () =>
            ch.consume(
              opts.queue,
              (msg: ConsumeMessage | null) => {
                if (msg === null) return // consumer cancelled by broker
                let body: unknown
                try {
                  body = JSON.parse(msg.content.toString("utf8"))
                } catch {
                  body = msg.content.toString("utf8")
                }

                const ackedMsg: AckedMessage = {
                  body,
                  headers: (msg.properties.headers as Record<string, unknown>) ?? {},
                  deliveryTag: msg.fields.deliveryTag,
                  ack: () =>
                    Effect.sync(() => {
                      ch.ack(msg)
                    }),
                  nack: () =>
                    Effect.sync(() => {
                      ch.nack(msg, false, false) // requeue=false → DLX binding
                    }),
                }

                // Offer to the queue; if the queue is full this blocks the
                // amqplib I/O loop — that's intentional back-pressure.
                Effect.runSync(Queue.unsafeOffer(q, ackedMsg))
              },
              { noAck: autoAck },
            ),
          catch: (error) => new RabbitMQConnectionError({ cause: error }),
        })

        // Watch for channel/connection errors and shut down cleanly.
        ch.on("close", () => Effect.runSync(Queue.shutdown(q)))
        ch.on("error", () => Effect.runSync(Queue.shutdown(q)))
        conn.on("close", () => Effect.runSync(Queue.shutdown(q)))
        conn.on("error", () => Effect.runSync(Queue.shutdown(q)))

        return q as Queue.Dequeue<AckedMessage>
      }),
  })
})

export const RabbitConsumerServiceLive = Layer.effect(RabbitConsumerService, make)
