/**
 * src/app/features/webhooks/webhookRoutes.ts
 *
 * Webhook subscription management endpoints.
 *
 * All routes require authentication (PASETO Bearer token via requireAuth).
 * Secret format: "whsec_<base64-32-random-bytes>" — Standard Webhooks compatible.
 *
 * Endpoints:
 *   POST   /webhooks           — create a subscription
 *   GET    /webhooks           — list subscriptions for the authenticated user
 *   DELETE /webhooks/:id       — delete a subscription (ownership-checked)
 *   POST   /webhooks/:id/test  — send a test delivery to the subscriber URL
 */

import { randomBytes } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { Effect, Schema } from "effect"
import { eq, and, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { requireAuth } from "../auth2/authMiddleware.ts"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { webhookSubscriptions } from "../../../db/schema/webhookSchema.ts"
import { deliverWebhook } from "../../../workers/webhookWorker.ts"

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateWebhookBody = Schema.Struct({
  url: Schema.String.check(Schema.isPattern(/^https:\/\/.+/)),
  events: Schema.Array(Schema.String).check(Schema.isNonEmpty()),
})

const UpdateWebhookBody = Schema.Struct({
  url: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^https:\/\/.+/))),
  events: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isNonEmpty())),
  enabled: Schema.optionalKey(Schema.Boolean),
})

// ── Routes ────────────────────────────────────────────────────────────────────

export const webhookRoutes = async (fastify: FastifyInstance) => {
  // POST /api/v1/webhooks — create subscription
  fastify.post("/webhooks", {
    schema: {
      tags: ["Webhooks"],
      summary: "Create webhook subscription",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService

      const bodyResult = Schema.decodeUnknownResult(CreateWebhookBody)(req.body)
      if (!bodyResult.success) {
        return yield* Effect.fail({ _tag: "ValidationError" as const, message: "Invalid request body" } as never)
      }
      const body = bodyResult.value

      const userId = req.user!.sub
      const id = createId()
      // Standard Webhooks secret format: "whsec_<base64-32-bytes>"
      const secret = `whsec_${randomBytes(32).toString("base64")}`

      const [created] = yield* postgres.query((db) =>
        db
          .insert(webhookSubscriptions)
          .values({
            id,
            userId,
            url: body.url,
            events: body.events as string[],
            secret,
            enabled: true,
          })
          .returning()
      )

      return { id: created!.id, url: created!.url, events: created!.events, enabled: created!.enabled, secret, createdAt: created!.createdAt }
    }), { statusCode: 201 })
  })

  // GET /api/v1/webhooks — list subscriptions for current user
  fastify.get("/webhooks", {
    schema: {
      tags: ["Webhooks"],
      summary: "List webhook subscriptions",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService
      const userId = req.user!.sub

      const subs = yield* postgres.query((db) =>
        db
          .select({
            id: webhookSubscriptions.id,
            url: webhookSubscriptions.url,
            events: webhookSubscriptions.events,
            enabled: webhookSubscriptions.enabled,
            createdAt: webhookSubscriptions.createdAt,
          })
          .from(webhookSubscriptions)
          .where(eq(webhookSubscriptions.userId, userId))
      )

      return subs
    }))
  })

  // DELETE /api/v1/webhooks/:id — remove subscription (ownership-checked)
  fastify.delete("/webhooks/:id", {
    schema: {
      tags: ["Webhooks"],
      summary: "Delete webhook subscription",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService
      const userId = req.user!.sub
      const { id } = req.params as { id: string }

      const deleted = yield* postgres.query((db) =>
        db
          .delete(webhookSubscriptions)
          .where(
            and(
              eq(webhookSubscriptions.id, id),
              eq(webhookSubscriptions.userId, userId),
            )
          )
          .returning({ id: webhookSubscriptions.id })
      )

      if (deleted.length === 0) {
        return yield* Effect.fail({ _tag: "NotFoundError" as const, message: "Subscription not found" } as never)
      }

      return { deleted: true }
    }))
  })

  // POST /api/v1/webhooks/:id/test — send a test ping to the subscriber URL
  fastify.post("/webhooks/:id/test", {
    schema: {
      tags: ["Webhooks"],
      summary: "Send test ping to webhook URL",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService
      const userId = req.user!.sub
      const { id } = req.params as { id: string }

      const [sub] = yield* postgres.query((db) =>
        db
          .select()
          .from(webhookSubscriptions)
          .where(
            and(
              eq(webhookSubscriptions.id, id),
              eq(webhookSubscriptions.userId, userId),
              sql`${webhookSubscriptions.enabled} = true`,
            )
          )
          .limit(1)
      )

      if (!sub) {
        return yield* Effect.fail({ _tag: "NotFoundError" as const, message: "Subscription not found or disabled" } as never)
      }

      const deliveryId = createId()
      const statusCode = yield* deliverWebhook({
        deliveryId,
        subscriptionId: sub.id,
        event: "webhook.test",
        payload: { message: "This is a test event from ScaleForge", timestamp: new Date().toISOString() },
        secret: sub.secret,
        url: sub.url,
        attempt: 0,
      }).pipe(
        Effect.map((code) => code),
        Effect.catchAll(() => Effect.succeed(0)),
      )

      return { delivered: statusCode >= 200 && statusCode < 300, statusCode, deliveryId }
    }))
  })
}
