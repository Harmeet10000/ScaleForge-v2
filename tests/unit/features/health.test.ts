/**
 * tests/unit/features/health.test.ts
 *
 * TDD: health service — all three checks (mongo, postgres, redis) tested in isolation.
 * Uses Effect TestContext / Layer substitution (no real DB connections).
 */

import { describe, it, expect } from "bun:test"
import { Effect, Layer, Exit } from "effect"
import { MongoService } from "../../../src/infra/mongo/mongoService.ts"
import { PostgresService } from "../../../src/infra/postgres/postgresService.ts"
import { RedisService } from "../../../src/infra/redis/redisService.ts"
import { healthCheck, type HealthCheckResult } from "../../../src/app/features/health/healthService.ts"
import {
  MongoConnectionError,
  PostgresQueryError,
  RedisCommandError,
} from "../../../src/core/errors/infraErrors.ts"

// ── Test layer stubs ─────────────────────────────────────────────────────────

const healthyMongo = Layer.succeed(MongoService, MongoService.of({
  connection: {} as never,
  ping: () => Effect.succeed("PONG" as const),
}))

const unhealthyMongo = Layer.succeed(MongoService, MongoService.of({
  connection: {} as never,
  ping: () => Effect.fail(new MongoConnectionError({ cause: new Error("mongo down") })),
}))

const healthyPostgres = Layer.succeed(PostgresService, PostgresService.of({
  db: {} as never,
  query: () => Effect.succeed([{ "?column?": 1 }] as never),
}))

const unhealthyPostgres = Layer.succeed(PostgresService, PostgresService.of({
  db: {} as never,
  query: () => Effect.fail(new PostgresQueryError({ message: "postgres down", cause: new Error() })),
}))

const healthyRedis = Layer.succeed(RedisService, RedisService.of({
  client: {} as never,
  get: () => Effect.succeed(null),
  set: () => Effect.succeed("OK" as const),
  del: () => Effect.succeed(0),
  hget: () => Effect.succeed(null),
  hset: () => Effect.void,
  hdel: () => Effect.succeed(0),
  isConnected: () => true,
  ping: () => Effect.succeed("PONG" as const),
}))

const unhealthyRedis = Layer.succeed(RedisService, RedisService.of({
  client: {} as never,
  get: () => Effect.succeed(null),
  set: () => Effect.succeed("OK" as const),
  del: () => Effect.succeed(0),
  hget: () => Effect.succeed(null),
  hset: () => Effect.void,
  hdel: () => Effect.succeed(0),
  isConnected: () => false,
  ping: () => Effect.fail(new RedisCommandError({ command: "PING", cause: new Error("redis down") })),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe("healthCheck", () => {
  it("returns healthy when all services respond", async () => {
    const program = healthCheck.pipe(
      Effect.provide(Layer.mergeAll(healthyMongo, healthyPostgres, healthyRedis))
    )
    const result = await Effect.runPromise(program)
    expect(result.status).toBe("healthy")
    expect(result.checks.mongo).toBe("ok")
    expect(result.checks.postgres).toBe("ok")
    expect(result.checks.redis).toBe("ok")
  })

  it("returns degraded when mongo is down", async () => {
    const program = healthCheck.pipe(
      Effect.provide(Layer.mergeAll(unhealthyMongo, healthyPostgres, healthyRedis))
    )
    const result = await Effect.runPromise(program)
    expect(result.status).toBe("degraded")
    expect(result.checks.mongo).toMatch(/error/)
  })

  it("returns degraded when postgres is down", async () => {
    const program = healthCheck.pipe(
      Effect.provide(Layer.mergeAll(healthyMongo, unhealthyPostgres, healthyRedis))
    )
    const result = await Effect.runPromise(program)
    expect(result.status).toBe("degraded")
    expect(result.checks.postgres).toMatch(/error/)
  })

  it("returns degraded when redis is disconnected", async () => {
    const program = healthCheck.pipe(
      Effect.provide(Layer.mergeAll(healthyMongo, healthyPostgres, unhealthyRedis))
    )
    const result = await Effect.runPromise(program)
    expect(result.status).toBe("degraded")
    expect(result.checks.redis).toMatch(/error/)
  })
})
