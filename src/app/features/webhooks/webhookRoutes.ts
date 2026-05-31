import type { FastifyInstance } from "fastify"
import { Schema } from "effect"

// Schemas
const CreateWebhookBody = Schema.Struct({
  url: Schema.String.pipe(Schema.pattern(/^https:\/\/.+/)),
  events: Schema.Array(Schema.String).pipe(Schema.minItems(1)),
})

const UpdateWebhookBody = Schema.Struct({
  url: Schema.optionalKey(Schema.String.pipe(Schema.pattern(/^https:\/\/.+/))),
  events: Schema.optionalKey(Schema.Array(Schema.String).pipe(Schema.minItems(1))),
  enabled: Schema.optionalKey(Schema.Boolean),
})

// Routes: all require authenticated user (PASETO middleware applied at app level)
export const webhookRoutes = async (fastify: FastifyInstance) => {
  // POST /api/v1/webhooks — create subscription
  fastify.post("/webhooks", {
    schema: {
      tags: ["Webhooks"],
      summary: "Create webhook subscription",
    },
  }, async (req, reply) => {
    // TODO (Phase 5): decode PASETO token → userId
    // TODO: insert into webhookSubscriptions, generate random secret
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })

  // GET /api/v1/webhooks — list subscriptions for current user
  fastify.get("/webhooks", {
    schema: {
      tags: ["Webhooks"],
      summary: "List webhook subscriptions",
    },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })

  // DELETE /api/v1/webhooks/:id — remove subscription
  fastify.delete("/webhooks/:id", {
    schema: {
      tags: ["Webhooks"],
      summary: "Delete webhook subscription",
    },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })

  // POST /api/v1/webhooks/:id/test — send a test ping to the subscriber URL
  fastify.post("/webhooks/:id/test", {
    schema: {
      tags: ["Webhooks"],
      summary: "Send test ping to webhook URL",
    },
  }, async (_req, reply) => {
    return reply.status(501).send({ success: false, statusCode: 501, message: "Not implemented yet", data: null })
  })
}
