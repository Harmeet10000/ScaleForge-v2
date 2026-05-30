import { Context, Effect, Layer } from "effect"
import { LRUCache } from "lru-cache"
import { eq } from "drizzle-orm"
import { PostgresService } from "../postgres/postgresService.ts"
import { featureFlags } from "../../db/schema/featureFlagSchema.ts"

export interface FeatureFlagService {
  readonly isEnabled: (key: string, userId?: string) => Effect.Effect<boolean>
  readonly invalidate: (key: string) => Effect.Effect<void>
}

export const FeatureFlagService = Context.Service<FeatureFlagService>("@infra/FeatureFlagService")

// 30-second TTL, max 500 entries (Decision #77)
const makeCache = () =>
  new LRUCache<string, boolean>({ max: 500, ttl: 30_000, allowStale: false })

const make = Effect.gen(function* () {
  const postgres = yield* PostgresService
  const cache = makeCache()

  const isEnabled = (key: string, userId?: string) =>
    Effect.gen(function* () {
      const cacheKey = userId ? `${key}:${userId}` : key
      const cached = cache.get(cacheKey)
      if (cached !== undefined) return cached

      const rows = yield* postgres.query((db) =>
        db
          .select()
          .from(featureFlags)
          .where(eq(featureFlags.key, key))
          .limit(1)
      )

      const flag = rows[0]
      if (!flag) {
        cache.set(cacheKey, false)
        return false
      }

      // Per-user targeting: if userId is in the allow-list, override global toggle
      if (userId && flag.targeting?.userIds?.includes(userId)) {
        cache.set(cacheKey, true)
        return true
      }

      cache.set(cacheKey, flag.enabled)
      return flag.enabled
    })

  const invalidate = (key: string) =>
    Effect.sync(() => {
      // Evict all entries that start with this key (covers base + per-user variants)
      for (const k of cache.keys()) {
        if (k === key || k.startsWith(`${key}:`)) cache.delete(k)
      }
    })

  return FeatureFlagService.of({ isEnabled, invalidate })
})

export const FeatureFlagServiceLive = Layer.effect(FeatureFlagService, make)
