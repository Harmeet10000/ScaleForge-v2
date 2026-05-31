/**
 * src/infra/rateLimit/outboundRateLimiter.ts
 *
 * Outbound API rate limiter using Bottleneck.
 *
 * Why not just rely on provider error codes?
 *   - Razorpay, Resend, and Gemini return 429s that count against quotas
 *   - Proactive client-side throttling prevents quota exhaustion entirely
 *   - Bottleneck queues requests instead of failing them — transparent to callers
 *
 * Each external service gets its own limiter configured to its documented limits.
 * Import the pre-built limiter in the service that calls the external API.
 *
 * Usage in an Effect service:
 *   const result = await razorpayLimiter.schedule(() => razorpay.orders.create(...))
 *
 * Effect integration:
 *   const createOrder = (input: OrderInput) =>
 *     Effect.tryPromise({
 *       try: () => razorpayLimiter.schedule(() => razorpay.orders.create(input)),
 *       catch: (e) => new ExternalServiceError({ service: "razorpay", cause: e }),
 *     })
 */

import Bottleneck from "bottleneck"

// ── Factory ───────────────────────────────────────────────────────────────────

export interface RateLimiterOptions {
  /** Max concurrent in-flight requests */
  readonly maxConcurrent: number
  /** Minimum time between requests in ms (0 = no minimum) */
  readonly minTime?: number
  /** Max queue size before rejecting new requests (-1 = unlimited) */
  readonly maxQueueSize?: number
  /** Human-readable name for debugging */
  readonly id?: string
}

export const createRateLimiter = (opts: RateLimiterOptions): Bottleneck =>
  new Bottleneck({
    maxConcurrent: opts.maxConcurrent,
    minTime: opts.minTime ?? 0,
    highWater: opts.maxQueueSize ?? -1,
    strategy: opts.maxQueueSize !== undefined
      ? Bottleneck.strategy.OVERFLOW  // drop new requests when queue is full
      : Bottleneck.strategy.LEAK,     // default — process all queued items
    ...(opts.id !== undefined ? { id: opts.id } : {}),
  })

// ── Pre-built limiters per external service ───────────────────────────────────
// Tune these to the documented API limits of each provider.

/**
 * Razorpay: 500 requests/minute = ~8.3 req/s.
 * Conservative: 5 concurrent, 120ms between calls = ~8 req/s max.
 */
export const razorpayLimiter = createRateLimiter({
  id: "razorpay",
  maxConcurrent: 5,
  minTime: 120,
  maxQueueSize: 100,
})

/**
 * Resend: Free tier = 100 emails/day; Pro = 50k/month.
 * Conservative: 2 concurrent, 500ms between calls.
 * Upgrade to looser limits when on a paid plan.
 */
export const resendLimiter = createRateLimiter({
  id: "resend",
  maxConcurrent: 2,
  minTime: 500,
  maxQueueSize: 50,
})

/**
 * Gemini API: 60 requests/minute on free tier, 1000 on paid.
 * Conservative: 10 concurrent, 100ms between calls = 10 req/s.
 */
export const geminiLimiter = createRateLimiter({
  id: "gemini",
  maxConcurrent: 10,
  minTime: 100,
  maxQueueSize: 200,
})

/**
 * Knock (notifications): 100 requests/second on free, 1000 on growth.
 * Very generous — no real constraint needed.
 */
export const knockLimiter = createRateLimiter({
  id: "knock",
  maxConcurrent: 20,
  minTime: 10,
})

/**
 * Elasticsearch: cluster-dependent, default 1000 req/s.
 * Conservative for single-node dev: 20 concurrent.
 */
export const elasticLimiter = createRateLimiter({
  id: "elasticsearch",
  maxConcurrent: 20,
  minTime: 0,
})

// ── Metric helpers ────────────────────────────────────────────────────────────

export type LimiterStats = {
  readonly id: string
  readonly queued: number
  readonly running: Promise<number>
  readonly done: Promise<number>
}

export const getLimiterStats = (id: string, limiter: Bottleneck): LimiterStats => ({
  id,
  queued: limiter.queued(),
  running: limiter.running(),
  done: limiter.done(),
})
