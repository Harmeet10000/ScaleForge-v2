/**
 * src/app/features/health/healthService.ts
 *
 * Pure Effect business logic — no Fastify imports.
 * Runs three concurrent checks and aggregates results.
 */

import { Cause, Effect } from "effect"
import { MongoService } from "../../../infra/mongo/mongoService.ts"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { RedisService } from "../../../infra/redis/redisService.ts"

export interface HealthCheckResult {
  readonly status: "healthy" | "degraded"
  readonly checks: {
    readonly mongo: string
    readonly postgres: string
    readonly redis: string
  }
  readonly timestamp: string
}

// Wrap a check so any failure (typed or defect) becomes an error string.
const safe = <A>(effect: Effect.Effect<A, unknown, never>): Effect.Effect<"ok" | string, never, never> =>
  effect.pipe(
    Effect.as("ok" as const),
    Effect.catchCause((cause) => {
      const err = Cause.squash(cause)
      const tag = (err as { _tag?: string })._tag ?? "UnknownError"
      return Effect.succeed(`error: ${tag}`)
    })
  )

// ── Individual checks ────────────────────────────────────────────────────────

const checkMongo = safe(
  MongoService.pipe(Effect.flatMap((s) => s.ping()))
)

const checkPostgres = safe(
  PostgresService.pipe(
    Effect.flatMap((s) => s.query((db) => db.execute("SELECT 1" as never)))
  )
)

const checkRedis = safe(
  RedisService.pipe(Effect.flatMap((s) => s.ping()))
)

// ── Composite health check ───────────────────────────────────────────────────

export const healthCheck = Effect.all(
  { mongo: checkMongo, postgres: checkPostgres, redis: checkRedis },
  { concurrency: 3 }
).pipe(
  Effect.map((checks) => ({
    status: (Object.values(checks).every((v) => v === "ok") ? "healthy" : "degraded") as "healthy" | "degraded",
    checks,
    timestamp: new Date().toISOString(),
  } satisfies HealthCheckResult))
)
