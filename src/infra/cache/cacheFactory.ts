/**
 * src/infra/cache/cacheFactory.ts
 *
 * Typed LRU cache factory built on lru-cache.
 *
 * Rules enforced by this factory (per AGENTS.md constraint):
 *   - Every cache MUST have explicit `max` and `ttl`
 *   - `allowStale` defaults to false (stale data is a bug, not a feature)
 *   - Keys and values are typed at creation time
 *
 * Usage:
 *   const userCache = createCache<string, UserProfile>({
 *     name: "users",
 *     max: 500,
 *     ttlMs: 30_000, // 30s
 *   })
 *   userCache.set("userId", profile)
 *   const profile = userCache.get("userId")
 */

import { LRUCache } from "lru-cache"

// ── Options ───────────────────────────────────────────────────────────────────

export interface CacheOptions {
  /** Human-readable name for metrics/logging */
  readonly name: string
  /** Maximum number of entries before eviction */
  readonly max: number
  /** Entry TTL in milliseconds */
  readonly ttlMs: number
  /**
   * Whether to return stale entries while a fresh value is being fetched.
   * Default: false. Only set to true when a momentarily stale value is
   * explicitly acceptable (e.g. feature flags with a 1s grace window).
   */
  readonly allowStale?: boolean
  /**
   * Update the TTL on every `get` call (sliding TTL).
   * Default: false (fixed TTL from time of `set`).
   */
  readonly updateAgeOnGet?: boolean
}

// ── Cache wrapper ─────────────────────────────────────────────────────────────

export interface AppCache<K extends {}, V extends {}> {
  readonly name: string
  get(key: K): V | undefined
  set(key: K, value: V): void
  delete(key: K): void
  has(key: K): boolean
  clear(): void
  size(): number
}

export const createCache = <K extends {}, V extends {}>(
  options: CacheOptions,
): AppCache<K, V> => {
  const cache = new LRUCache<K, V>({
    max: options.max,
    ttl: options.ttlMs,
    allowStale: options.allowStale ?? false,
    updateAgeOnGet: options.updateAgeOnGet ?? false,
  })

  return {
    name: options.name,
    get: (key) => cache.get(key),
    set: (key, value) => { cache.set(key, value) },
    delete: (key) => { cache.delete(key) },
    has: (key) => cache.has(key),
    clear: () => { cache.clear() },
    size: () => cache.size,
  }
}

// ── Pre-built cache instances (singletons) ────────────────────────────────────
// Import these in services instead of creating ad-hoc instances.
// Each cache is explicitly sized and TTL'd per AGENTS.md rules.

/** Short-lived user profile cache — avoids repeated DB lookups within a request burst */
export const userProfileCache = createCache<string, object>({
  name: "user-profiles",
  max: 1_000,
  ttlMs: 60_000,        // 1 min
})

/** API key → user mapping (high read, low write) */
export const apiKeyCache = createCache<string, object>({
  name: "api-keys",
  max: 2_000,
  ttlMs: 5 * 60_000,    // 5 min
})

/** Webhook subscription lookup (by owner userId) */
export const webhookSubCache = createCache<string, object>({
  name: "webhook-subs",
  max: 500,
  ttlMs: 2 * 60_000,    // 2 min
})
