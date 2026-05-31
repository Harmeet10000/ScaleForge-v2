import type { FastifyInstance } from "fastify"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { healthCheck } from "./healthService.ts"

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
    return effectHandler(req, reply, healthCheck, {
      transform: (result, reply) => {
        const code = result.status === "healthy" ? 200 : 503
        void reply.status(code).send(result)
      },
    })
  })
}
