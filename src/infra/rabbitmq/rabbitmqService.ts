import { Context, Effect, Layer, Schedule } from "effect"
import amqplib, { type Connection, type Channel } from "amqplib"
import { AppConfig } from "../../core/config/configService.ts"
import { RabbitMQConnectionError, RabbitMQPublishError } from "../../core/errors/infraErrors.ts"

export interface RabbitMQService {
  readonly publish: (
    exchange: string,
    routingKey: string,
    message: unknown
  ) => Effect.Effect<void, RabbitMQPublishError>
  readonly isConnected: () => boolean
}

export const RabbitMQService = Context.GenericTag<RabbitMQService>("@infra/RabbitMQService")

const connectWithRetry = (url: string) =>
  Effect.retry(
    Effect.tryPromise({
      try: () => amqplib.connect(url),
      catch: (error) => new RabbitMQConnectionError({ cause: error }),
    }),
    Schedule.exponential("1 second").pipe(Schedule.compose(Schedule.recurs(5)))
  )

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  const { connection, channel } = yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const conn: Connection = yield* connectWithRetry(config.rabbitmq.url)
      const ch: Channel = yield* Effect.tryPromise({
        try: () => conn.createChannel(),
        catch: (error) => new RabbitMQConnectionError({ cause: error }),
      })
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            ch.assertExchange("main-exchange", "topic", { durable: true }),
            ch.prefetch(10),
          ]),
        catch: (error) => new RabbitMQConnectionError({ cause: error }),
      })
      return { connection: conn, channel: ch }
    }),
    ({ connection }) =>
      Effect.tryPromise({
        try: () => connection.close(),
        catch: () => void 0,
      }).pipe(Effect.ignoreLogged)
  )

  let connected = true
  connection.on("close", () => { connected = false })
  connection.on("error", () => { connected = false })

  return RabbitMQService.of({
    publish: (exchange, routingKey, message) =>
      Effect.tryPromise({
        try: async () => {
          const payload = Buffer.from(JSON.stringify(message))
          const ok = channel.publish(exchange, routingKey, payload, { persistent: true })
          if (!ok) throw new Error("Channel write buffer full")
        },
        catch: (error) => new RabbitMQPublishError({ exchange, routingKey, cause: error }),
      }).pipe(
        Effect.retry(
          Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3)))
        )
      ),
    isConnected: () => connected,
  })
})

export const RabbitMQServiceLive = Layer.scoped(RabbitMQService, make)
