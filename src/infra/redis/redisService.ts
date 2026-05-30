import { Context, Effect, Layer, Redacted } from "effect"
import Redis from "ioredis"
import { AppConfig } from "../../core/config/configService.ts"
import { RedisCommandError, RedisConnectionError } from "../../core/errors/infraErrors.ts"

export interface RedisService {
  readonly client: Redis
  readonly get: (key: string) => Effect.Effect<string | null, RedisCommandError>
  readonly set: (key: string, value: string, ttl?: number) => Effect.Effect<"OK" | null, RedisCommandError>
  readonly del: (key: string) => Effect.Effect<number, RedisCommandError>
  readonly hget: (key: string, field: string) => Effect.Effect<string | null, RedisCommandError>
  readonly hset: (key: string, field: string, value: string, ttl?: number) => Effect.Effect<void, RedisCommandError>
  readonly hdel: (key: string, field: string) => Effect.Effect<number, RedisCommandError>
  readonly isConnected: () => boolean
  readonly ping: () => Effect.Effect<"PONG", RedisCommandError>
}

export const RedisService = Context.Service<RedisService>("@infra/RedisService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  const client = yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        username: config.redis.username,
        password: Redacted.value(config.redis.password),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 120_000,
        family: 4,
        db: 0,
        connectTimeout: 120_000,
        commandTimeout: 5_000,
        enableAutoPipelining: true,
        autoResubscribe: true,
        autoResendUnfulfilledCommands: true,
      })
      yield* Effect.tryPromise({
        try: () => redis.connect(),
        catch: (error) => new RedisConnectionError({ cause: error }),
      })
      return redis
    }),
    (redis) =>
      Effect.tryPromise({
        try: () => redis.quit(),
        catch: () => void 0,
      }).pipe(Effect.ignoreLogged)
  )

  return RedisService.of({
    client,
    get: (key) =>
      Effect.tryPromise({
        try: () => client.get(key),
        catch: (error) => new RedisCommandError({ command: "GET", cause: error }),
      }),
    set: (key, value, ttl) =>
      Effect.tryPromise({
        try: () => (ttl != null ? client.set(key, value, "EX", ttl) : client.set(key, value)),
        catch: (error) => new RedisCommandError({ command: "SET", cause: error }),
      }),
    del: (key) =>
      Effect.tryPromise({
        try: () => client.del(key),
        catch: (error) => new RedisCommandError({ command: "DEL", cause: error }),
      }),
    hget: (key, field) =>
      Effect.tryPromise({
        try: () => client.hget(key, field),
        catch: (error) => new RedisCommandError({ command: "HGET", cause: error }),
      }),
    hset: (key, field, value, ttl) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => client.hset(key, field, value),
          catch: (error) => new RedisCommandError({ command: "HSET", cause: error }),
        })
        if (ttl != null) {
          yield* Effect.tryPromise({
            try: () => client.expire(key, ttl),
            catch: (error) => new RedisCommandError({ command: "EXPIRE", cause: error }),
          })
        }
      }),
    hdel: (key, field) =>
      Effect.tryPromise({
        try: () => client.hdel(key, field),
        catch: (error) => new RedisCommandError({ command: "HDEL", cause: error }),
      }),
    isConnected: () => client.status === "ready",
    ping: () =>
      Effect.tryPromise({
        try: () => client.ping(),
        catch: (error) => new RedisCommandError({ command: "PING", cause: error }),
      }).pipe(Effect.as("PONG" as const)),
  })
})

export const RedisServiceLive = Layer.effect(RedisService, make)
