import type { FastifyInstance } from "fastify"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { healthCheck } from "./healthService.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"
import { Effect } from "effect"

export const healthRoutes = async (fastify: FastifyInstance) => {
  fastify.get("/health", {
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
  }, async (req, reply) => {
    return effectHandler(req, reply, healthCheck as Effect.Effect<{ status: "healthy" | "degraded"; checks: Record<string, string>; timestamp: string }, AppError, never>, {
      transform: (result, reply) => {
        const code = result.status === "healthy" ? 200 : 503
        void reply.status(code).send(result)
      },
    })
  })
}
