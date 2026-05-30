import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"
import rateLimit from "@fastify/rate-limit"

// Per-route rate limit overrides — apply these in route config.
// Example: fastify.post("/login", { config: { rateLimit: authRateLimits.login } }, handler)
export const authRateLimits = {
  login:          { max: 5,  timeWindow: "1 minute" },
  register:       { max: 3,  timeWindow: "1 minute" },
  forgotPassword: { max: 2,  timeWindow: "1 minute" },
  refreshToken:   { max: 10, timeWindow: "1 minute" },
  verifyOtp:      { max: 5,  timeWindow: "5 minutes" },
} as const

export const rateLimitPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "15 minutes",
    // Redis store for distributed rate limiting across multiple instances.
    // Requires RedisService to be registered as a Fastify decorator first.
    // redis: fastify.effectRuntime.runSync(RedisService).client,
    keyGenerator: (req) =>
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      success: false,
      statusCode: 429,
      message: `Rate limit exceeded. Retry after ${context.after}`,
      data: null,
    }),
    // Skip rate limiting for /metrics (internal scrape endpoint)
    skip: (req) => req.url === "/metrics",
  })
})
