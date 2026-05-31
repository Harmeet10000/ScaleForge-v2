/**
 * src/app/features/notifications/knockBridgeRoutes.ts
 *
 * Inbound Knock webhook bridge.
 *
 * Knock calls this endpoint when a notification event fires (e.g. message
 * delivered, workflow completed).  We verify the request signature using the
 * shared `KNOCK_WEBHOOK_SECRET` env var, then re-emit the event as a
 * ScaleForge domain event through WebhookPublisher so that any subscriber
 * watching `notification.delivered` etc. receives a fan-out delivery.
 *
 * Knock webhook docs:
 *   https://docs.knock.app/send-notifications/webhook-subscriptions
 *
 * Signature scheme: HMAC-SHA256 over raw body, compared against the
 * `X-Knock-Signature` request header.
 *
 * Endpoint: POST /api/v1/notifications/knock/webhook
 */

import type { FastifyPluginAsync } from "fastify"
import { Effect, Redacted } from "effect"
import { createHmac, timingSafeEqual } from "node:crypto"
import { AppConfig } from "../../../core/config/configService.ts"
import { WebhookPublisher } from "../../../infra/webhooks/webhookPublisher.ts"

// ── Knock → ScaleForge domain event mapping ────────────────────────────────────

const KNOCK_EVENT_MAP: Record<string, string> = {
  "message.sent": "notification.sent",
  "message.delivered": "notification.delivered",
  "message.bounced": "notification.bounced",
  "message.undelivered": "notification.undelivered",
  "workflow.run.finished": "notification.workflow_completed",
}

// ── Route body type ────────────────────────────────────────────────────────────

interface KnockWebhookBody {
  type: string
  data?: unknown
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const knockBridgeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: KnockWebhookBody }>(
    "/notifications/knock/webhook",
    async (request, reply) => {
      // ── 1. Verify Knock signature ─────────────────────────────────────────────
      const signature = request.headers["x-knock-signature"] as string | undefined
      if (!signature) {
        return reply.status(401).send({ ok: false, message: "Missing X-Knock-Signature header" })
      }

      // Fetch the webhook secret from Effect config layer
      const secretResult = await request.server.effectRuntime.runPromiseExit(
        Effect.flatMap(AppConfig, (cfg) => Effect.succeed(Redacted.value(cfg.knock.webhookSecret))),
      )

      if (secretResult._tag === "Failure" || !secretResult.value) {
        request.log.warn("[knock-bridge] KNOCK_WEBHOOK_SECRET not configured — rejecting request")
        return reply.status(401).send({ ok: false, message: "Webhook verification not configured" })
      }

      const secret = secretResult.value
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody

      if (!rawBody || !secret) {
        return reply.status(400).send({ ok: false, message: "Raw body unavailable for signature verification" })
      }

      const expectedSig = createHmac("sha256", secret).update(rawBody).digest("hex")
      const expectedBuf = Buffer.from(expectedSig, "utf8")
      const receivedBuf = Buffer.from(signature, "utf8")

      const signaturesMatch =
        expectedBuf.byteLength === receivedBuf.byteLength &&
        timingSafeEqual(expectedBuf, receivedBuf)

      if (!signaturesMatch) {
        request.log.warn("[knock-bridge] signature mismatch — rejecting Knock webhook")
        return reply.status(401).send({ ok: false, message: "Invalid webhook signature" })
      }

      // ── 2. Map Knock event to domain event and emit ───────────────────────────
      const { type: knockEventType, data: eventData } = request.body

      const domainEventName = KNOCK_EVENT_MAP[knockEventType]
      if (!domainEventName) {
        // Unknown Knock event — accept (200) but don't emit
        request.log.info({ knockEventType }, "[knock-bridge] unknown Knock event type — ignoring")
        return reply.send({ ok: true })
      }

      // Emit via WebhookPublisher (fire-and-forget, non-blocking)
      await request.server.effectRuntime.runPromiseExit(
        Effect.flatMap(WebhookPublisher, (publisher) =>
          publisher.emit(domainEventName, {
            source: "knock",
            knockEventType,
            data: eventData,
          }),
        ).pipe(Effect.ignore),
      )

      request.log.info({ knockEventType, domainEventName }, "[knock-bridge] Knock event bridged")
      return reply.send({ ok: true })
    },
  )
}
