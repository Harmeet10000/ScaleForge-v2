import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"
import rateLimit from "@fastify/rate-limit"
import { Redis } from "ioredis"

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
  // Use a dedicated ioredis client for rate limiting.
  // This is intentionally separate from RedisService so the plugin is
  // self-contained and doesn't create a circular dependency with appLayer.
  const redisUrl = process.env["REDIS_URL"]
  const redisClient = redisUrl
    ? new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false })
    : new Redis({
        host: process.env["REDIS_HOST"] ?? "localhost",
        port: Number(process.env["REDIS_PORT"] ?? 6379),
        lazyConnect: true,
        enableOfflineQueue: false,
      })

  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "15 minutes",
    redis: redisClient,           // Distributed rate limiting across all instances
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

  // Clean up the dedicated client when Fastify closes
  fastify.addHook("onClose", async () => {
    await redisClient.quit()
  })
})
