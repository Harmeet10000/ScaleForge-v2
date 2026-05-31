/**
 * src/infra/cache/requestDeduplicator.ts
 *
 * Concurrent request deduplication using async-cache-dedupe.
 *
 * Problem: When 50 concurrent requests all need the same feature flag or
 * the same external API resource, you want exactly ONE in-flight fetch —
 * not 50 parallel calls that all resolve to the same value.
 *
 * async-cache-dedupe solves this by coalescing concurrent calls with the
 * same cache key into a single Promise. Once the first call resolves all
 * waiting callers get the same result instantly.
 *
 * Usage:
 *   const getFlag = dedup.define('featureFlag', async (key: string) => {
 *     return db.query('SELECT value FROM feature_flags WHERE key = $1', [key])
 *   })
 *   // 100 concurrent calls → 1 DB query
 *   const value = await getFlag('dark_mode')
 */

import { createCache } from "async-cache-dedupe"

// ── Types ─────────────────────────────────────────────────────────────────────

export type DedupFn<K extends string, V> = (key: K) => Promise<V>

export interface DedupOptions {
  /** TTL in milliseconds. 0 = no caching, only in-flight dedup. */
  readonly ttlMs?: number
  /** Max cached entries. Only relevant when ttlMs > 0. */
  readonly max?: number
}

// ── Singleton deduplicator ────────────────────────────────────────────────────
// One shared instance keeps all dedup state in one place.
// Functions are registered at startup, before any requests arrive.

const globalDeduplicator = createCache({})

/**
 * Register a deduplicating async function.
 *
 * @param name  Unique string key for this function in the dedup registry
 * @param fn    The actual async fetcher — called at most once per unique key
 *              while a prior call is still in-flight
 * @param opts  Optional TTL + max for caching resolved values
 */
export const registerDedup = <V>(
  name: string,
  fn: (key: string) => Promise<V>,
  opts: DedupOptions = {},
): DedupFn<string, V> => {
  globalDeduplicator.define(name, {
    ...(opts.ttlMs !== undefined ? { ttl: opts.ttlMs / 1000 } : {}),
    ...(opts.max !== undefined ? { cacheSize: opts.max } : {}),
  }, fn)

  // Return a typed callable that looks up the registered function
  return (key: string) => (globalDeduplicator as unknown as Record<string, (k: string) => Promise<V>>)[name]!(key)
}

// ── Pre-registered deduplicators ──────────────────────────────────────────────
// These are stubs — wire the actual fetcher in the service that uses them.
// The service imports these and provides the implementation at startup.

/** Dedup feature flag lookups — register fetcher in featureFlagService */
export const dedupFeatureFlag: DedupFn<string, unknown> = registerDedup(
  "featureFlag",
  async (_key) => { throw new Error("featureFlag fetcher not registered") },
  { ttlMs: 30_000, max: 500 },
)

/** Dedup external API responses — register per-service in each infra layer */
export const dedupExternalApi: DedupFn<string, unknown> = registerDedup(
  "externalApi",
  async (_key) => { throw new Error("externalApi fetcher not registered") },
  { ttlMs: 5_000, max: 100 },
)
