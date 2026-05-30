import type { FastifyInstance } from "fastify"
import { Effect } from "effect"
import { MetricsService } from "../../../infra/telemetry/metricsService.ts"

// GET /metrics — Prometheus scrape endpoint.
// Not behind auth; restrict access at the infrastructure/network level (internal VPC only).
export const metricsRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    "/metrics",
    {
      config: { rateLimit: false },
      schema: { hide: true },  // exclude from Swagger
    },
    async (_req, reply) => {
      const metricsService = fastify.effectRuntime.runSync(
        Effect.map(MetricsService, (s) => s)
      )
      const metrics = await metricsService.registry.metrics()
      return reply.type(metricsService.registry.contentType).send(metrics)
    }
  )
}
