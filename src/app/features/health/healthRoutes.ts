import type { FastifyInstance } from "fastify"
import { Effect } from "effect"
import { healthCheck } from "./healthService.ts"

export const healthRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Service health check",
        response: {
          200: {
            type: "object",
            properties: {
              status:    { type: "string", enum: ["healthy", "degraded"] },
              checks:    { type: "object" },
              timestamp: { type: "string" },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const result = await fastify.effectRuntime.runPromise(healthCheck)
      const code = result.status === "healthy" ? 200 : 503
      return reply.status(code).send(result)
    }
  )
}
