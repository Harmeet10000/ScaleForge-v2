import type { FastifyInstance } from "fastify"

// Admin-only routes — protect with PASETO + role check in Phase 5.
// For now: stubs that will be wired to FeatureFlagService in Phase 3+.

export const adminFeatureFlagRoutes = async (fastify: FastifyInstance) => {
  // GET /api/v1/admin/flags
  fastify.get("/admin/flags", {
    schema: { tags: ["Admin"], summary: "List all feature flags" },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })

  // POST /api/v1/admin/flags
  fastify.post("/admin/flags", {
    schema: { tags: ["Admin"], summary: "Create feature flag" },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })

  // PATCH /api/v1/admin/flags/:key
  fastify.patch("/admin/flags/:key", {
    schema: { tags: ["Admin"], summary: "Enable/disable feature flag or update targeting" },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })

  // DELETE /api/v1/admin/flags/:key
  fastify.delete("/admin/flags/:key", {
    schema: { tags: ["Admin"], summary: "Delete feature flag" },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })
}
