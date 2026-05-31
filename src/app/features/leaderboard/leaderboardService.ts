/**
 * src/app/features/leaderboard/leaderboardService.ts
 *
 * Leaderboard business logic — Redis sorted sets + PostgreSQL event log.
 *
 * ## Redis key schema
 *
 *   lb:score:alltime            — all-time sorted set (never expires)
 *   lb:score:7d:<YYYYMMDD>      — daily bucket (EXPIREAT = 8 days from now)
 *   lb:score:24h:<YYYYMMDD-HH>  — hourly bucket (EXPIREAT = 25 hours from now)
 *   lb:cache:7d                 — ZUNIONSTORE result for last 7 days (TTL 30s)
 *   lb:cache:24h                — ZUNIONSTORE result for last 24 hours (TTL 30s)
 *   lb:updates                  — Redis pub/sub channel for WS fan-out
 *
 * ## Write path (recordEvent)
 *   1. ZINCRBY all 3 active bucket keys
 *   2. EXPIREAT the 7d/24h buckets at their window end
 *   3. INSERT into leaderboard_events (PostgreSQL)
 *   4. PUBLISH lb:updates with the delta JSON
 *
 * ## Read path (getLeaderboard)
 *   - alltime: ZREVRANGE lb:score:alltime 0 limit-1 WITHSCORES
 *   - 7d:  ZUNIONSTORE lb:cache:7d (last 7 daily keys) → EXPIRE 30 → ZREVRANGE
 *   - 24h: ZUNIONSTORE lb:cache:24h (last 24 hourly keys) → EXPIRE 30 → ZREVRANGE
 *
 * All Redis/DB errors use .orDie — leaderboard is best-effort, non-fatal.
 */

import { Context, Effect, Layer } from "effect"
import { format, addDays, addHours, startOfDay, startOfHour, subDays, subHours } from "date-fns"
import { RedisService } from "../../../infra/redis/redisService.ts"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { leaderboardEvents } from "../../../db/schema/leaderboardSchema.ts"

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeaderboardWindow = "alltime" | "7d" | "24h"

export interface ScoreEventInput {
  readonly userId: string
  readonly delta: number
  readonly entityType: string
  readonly entityId?: string
  readonly metadata?: Record<string, unknown>
}

export interface LeaderboardEntry {
  readonly userId: string
  readonly score: number
  readonly rank: number
}

export interface UserRankResult {
  readonly userId: string
  readonly rank: number | null    // null = user not on leaderboard
  readonly score: number          // 0 if not found
}

export interface LeaderboardDelta {
  readonly userId: string
  readonly delta: number
  readonly entityType: string
  readonly updatedScores: { alltime: number; "7d": number; "24h": number }
  readonly updatedRanks: { alltime: number | null; "7d": number | null; "24h": number | null }
  readonly timestamp: string
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface LeaderboardService {
  /** Record a score event. Updates Redis + Postgres + publishes WS delta. */
  readonly recordEvent: (event: ScoreEventInput) => Effect.Effect<LeaderboardDelta, never>
  /** Get top N leaderboard entries for a window. */
  readonly getLeaderboard: (
    window: LeaderboardWindow,
    limit?: number
  ) => Effect.Effect<LeaderboardEntry[], never>
  /** Get a single user's rank and score in a window. */
  readonly getUserRank: (
    window: LeaderboardWindow,
    userId: string
  ) => Effect.Effect<UserRankResult, never>
}

export const LeaderboardService = Context.Service<LeaderboardService>(
  "@features/LeaderboardService"
)

// ── Key helpers ───────────────────────────────────────────────────────────────

const ALLTIME_KEY = "lb:score:alltime"
const CHANNEL = "lb:updates"

const daily7dKey = (date: Date): string =>
  `lb:score:7d:${format(date, "yyyyMMdd")}`

const hourly24hKey = (date: Date): string =>
  `lb:score:24h:${format(date, "yyyyMMdd-HH")}`

/** Generate the last N daily keys (today first). */
const last7dKeys = (now: Date): string[] =>
  Array.from({ length: 7 }, (_, i) => daily7dKey(subDays(now, i)))

/** Generate the last 24 hourly keys (current hour first). */
const last24hKeys = (now: Date): string[] =>
  Array.from({ length: 24 }, (_, i) => hourly24hKey(subHours(now, i)))

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse ZREVRANGE WITHSCORES output ["m1","100","m2","80",...] into entries. */
const parseZrevrange = (raw: string[]): LeaderboardEntry[] => {
  const entries: LeaderboardEntry[] = []
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({
      userId: raw[i]!,
      score: Math.round(parseFloat(raw[i + 1] ?? "0")),
      rank: Math.floor(i / 2) + 1,
    })
  }
  return entries
}

/** ZUNIONSTORE then set a short TTL on the merged cache key. */
const buildCache = (
  redis: import("ioredis").Redis,
  cacheKey: string,
  sourceKeys: string[],
  ttlSeconds: number
): Promise<void> =>
  redis
    .zunionstore(cacheKey, sourceKeys.length, ...sourceKeys)
    .then(() => redis.expire(cacheKey, ttlSeconds))
    .then(() => undefined)

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const redisSvc = yield* RedisService
  const postgres = yield* PostgresService

  const redis = redisSvc.client

  // ── recordEvent ─────────────────────────────────────────────────────────────

  const recordEvent = (event: ScoreEventInput): Effect.Effect<LeaderboardDelta, never> =>
    Effect.gen(function* () {
      const now = new Date()
      const key7d = daily7dKey(now)
      const key24h = hourly24hKey(now)

      // 1. Atomically increment all 3 sorted sets
      const [alltimeNew, _7dNew, _24hNew] = yield* Effect.promise(() =>
        Promise.all([
          redis.zincrby(ALLTIME_KEY, event.delta, event.userId),
          redis.zincrby(key7d, event.delta, event.userId),
          redis.zincrby(key24h, event.delta, event.userId),
        ])
      )

      // 2. Set expiry on bucketed keys (idempotent — only matters on first write)
      //    7d bucket expires 8 days from start of today (so last day is still readable)
      //    24h bucket expires 25 hours from start of current hour
      yield* Effect.promise(() =>
        Promise.all([
          redis.expireat(key7d, Math.floor(addDays(startOfDay(now), 8).getTime() / 1000)),
          redis.expireat(key24h, Math.floor(addHours(startOfHour(now), 25).getTime() / 1000)),
        ])
      )

      // 3. Invalidate rolling-window caches so next read rebuilds them
      yield* Effect.promise(() =>
        Promise.all([
          redis.del("lb:cache:7d"),
          redis.del("lb:cache:24h"),
        ])
      )

      const alltimeScore = Math.round(parseFloat(alltimeNew ?? "0"))
      const score7d = Math.round(parseFloat(_7dNew ?? "0"))
      const score24h = Math.round(parseFloat(_24hNew ?? "0"))

      // 4. Get updated ranks (ZREVRANK = 0-indexed; +1 for 1-indexed)
      const [alltimeRankRaw, rank7dRaw, rank24hRaw] = yield* Effect.promise(() =>
        Promise.all([
          redis.zrevrank(ALLTIME_KEY, event.userId),
          redis.zrevrank(key7d, event.userId),
          redis.zrevrank(key24h, event.userId),
        ])
      )

      const delta: LeaderboardDelta = {
        userId: event.userId,
        delta: event.delta,
        entityType: event.entityType,
        updatedScores: { alltime: alltimeScore, "7d": score7d, "24h": score24h },
        updatedRanks: {
          alltime: alltimeRankRaw !== null ? alltimeRankRaw + 1 : null,
          "7d": rank7dRaw !== null ? rank7dRaw + 1 : null,
          "24h": rank24hRaw !== null ? rank24hRaw + 1 : null,
        },
        timestamp: now.toISOString(),
      }

      // 5. Write to PostgreSQL event log (fire-and-forget — non-critical)
      yield* Effect.forkDetach(
        postgres.query((db) =>
          db.insert(leaderboardEvents).values({
            userId: event.userId,
            delta: event.delta,
            entityType: event.entityType,
            entityId: event.entityId,
            metadata: event.metadata ?? {},
            occurredAt: now,
          })
        ).pipe(Effect.orDie)
      )

      // 6. Publish delta to Redis pub/sub for WS fan-out (fire-and-forget)
      yield* Effect.forkDetach(
        Effect.promise(() => redis.publish(CHANNEL, JSON.stringify(delta)))
      )

      return delta
    }).pipe(Effect.orDie)

  // ── getLeaderboard ──────────────────────────────────────────────────────────

  const getLeaderboard = (
    window: LeaderboardWindow,
    limit = 100
  ): Effect.Effect<LeaderboardEntry[], never> =>
    Effect.promise(async () => {
      const now = new Date()
      let activeKey: string

      if (window === "alltime") {
        activeKey = ALLTIME_KEY
      } else if (window === "7d") {
        activeKey = "lb:cache:7d"
        const exists = await redis.exists(activeKey)
        if (!exists) {
          await buildCache(redis, activeKey, last7dKeys(now), 30)
        }
      } else {
        activeKey = "lb:cache:24h"
        const exists = await redis.exists(activeKey)
        if (!exists) {
          await buildCache(redis, activeKey, last24hKeys(now), 30)
        }
      }

      const raw = await redis.zrevrange(activeKey, 0, limit - 1, "WITHSCORES")
      return parseZrevrange(raw)
    }).pipe(Effect.orDie)

  // ── getUserRank ─────────────────────────────────────────────────────────────

  const getUserRank = (
    window: LeaderboardWindow,
    userId: string
  ): Effect.Effect<UserRankResult, never> =>
    Effect.promise(async () => {
      const now = new Date()
      let activeKey: string

      if (window === "alltime") {
        activeKey = ALLTIME_KEY
      } else if (window === "7d") {
        activeKey = "lb:cache:7d"
        const exists = await redis.exists(activeKey)
        if (!exists) {
          await buildCache(redis, activeKey, last7dKeys(now), 30)
        }
      } else {
        activeKey = "lb:cache:24h"
        const exists = await redis.exists(activeKey)
        if (!exists) {
          await buildCache(redis, activeKey, last24hKeys(now), 30)
        }
      }

      const [rankRaw, scoreRaw] = await Promise.all([
        redis.zrevrank(activeKey, userId),
        redis.zscore(activeKey, userId),
      ])

      return {
        userId,
        rank: rankRaw !== null ? rankRaw + 1 : null,
        score: scoreRaw !== null ? Math.round(parseFloat(scoreRaw)) : 0,
      } satisfies UserRankResult
    }).pipe(Effect.orDie)

  return LeaderboardService.of({ recordEvent, getLeaderboard, getUserRank })
})

export const LeaderboardServiceLive = Layer.effect(LeaderboardService, make)
