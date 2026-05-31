/**
 * src/app/features/payments/paymentRoutes.ts
 *
 * Payment endpoints backed by the `payments` table (Razorpay).
 *
 * Endpoints:
 *   GET  /payments           — list payments (filtered by userId / orgId)
 *   GET  /payments/:id       — fetch single payment
 *   POST /payments/webhook/razorpay — inbound Razorpay webhook (raw body sub-plugin)
 *
 * The webhook route lives in a scoped sub-plugin with a custom
 * addContentTypeParser so the raw Buffer is available for HMAC verification.
 * This is the only correct way to get the raw body in Fastify — do NOT use
 * a global content-type override.
 *
 * Security:
 *   - Webhook route is CSRF-exempt (see securityPlugin CSRF_EXEMPT_PREFIXES).
 *   - Webhook route verifies X-Razorpay-Signature HMAC-SHA256 over raw body.
 *   - LIST/GET routes require Bearer auth.
 */

import type { FastifyInstance } from "fastify"
import { Effect, Result, Schema } from "effect"
import { eq, and, desc } from "drizzle-orm"
import { requireAuth } from "../auth2/authMiddleware.ts"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { payments } from "../../../db/schema/paymentSchema.ts"
import { verifyRazorpaySignature } from "./webhookVerification.ts"
import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from "../../../core/errors/commonErrors.ts"

// ── Schemas ───────────────────────────────────────────────────────────────────

const PaymentQueryParams = Schema.Struct({
  userId: Schema.optionalKey(Schema.String),
  organizationId: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(
    Schema.NumberFromString.check(Schema.isBetween({ minimum: 1, maximum: 200 }))
  ),
  offset: Schema.optionalKey(
    Schema.NumberFromString.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))
  ),
})

// ── Routes ────────────────────────────────────────────────────────────────────

export const paymentRoutes = async (fastify: FastifyInstance) => {
  // ── GET /payments — list with optional filters ──────────────────────────────
  fastify.get("/payments", {
    schema: {
      tags: ["Payments"],
      summary: "List payments",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService

      const qResult = Schema.decodeUnknownResult(PaymentQueryParams)(req.query)
      if (Result.isFailure(qResult)) {
        return yield* Effect.fail(new ValidationError({ field: "query", message: "Invalid query parameters" }))
      }
      const q = qResult.success
      const limit = q.limit ?? 50
      const offset = q.offset ?? 0

      const conditions = [
        q.userId != null ? eq(payments.userId, q.userId) : undefined,
        q.organizationId != null ? eq(payments.organizationId, q.organizationId) : undefined,
        q.status != null ? eq(payments.status, q.status) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c != null)

      const rows = yield* postgres.query((db) =>
        db
          .select()
          .from(payments)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(payments.createdAt))
          .limit(limit)
          .offset(offset)
      ).pipe(Effect.mapError((e) => new ExternalServiceError({ service: "postgres", cause: e })))

      return { payments: rows, limit, offset, count: rows.length }
    }))
  })

  // ── GET /payments/:id — single payment ─────────────────────────────────────
  fastify.get("/payments/:id", {
    schema: {
      tags: ["Payments"],
      summary: "Get payment by ID",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService
      const { id } = req.params as { id: string }

      const [payment] = yield* postgres.query((db) =>
        db
          .select()
          .from(payments)
          .where(eq(payments.id, id))
          .limit(1)
      ).pipe(Effect.mapError((e) => new ExternalServiceError({ service: "postgres", cause: e })))

      if (!payment) {
        return yield* Effect.fail(new NotFoundError({ resource: "Payment", identifier: id }))
      }

      return payment
    }))
  })

  // ── POST /payments/webhook/razorpay — raw body sub-plugin ──────────────────
  //
  // This sub-plugin registers its own content-type parser that reads the body
  // as a Buffer (so we can HMAC-verify), then JSON-parses it and stores the
  // raw Buffer on req for the handler.
  //
  // The sub-plugin scope isolates this parser to the webhook route only —
  // other routes continue to use Fastify's built-in JSON parser.
  await fastify.register(async (webhook) => {
    // Override JSON parsing for this scope only: Buffer → save raw → parse JSON
    webhook.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body: Buffer, done) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(_req as unknown as Record<string, unknown>)["rawBody"] = body
          done(null, JSON.parse(body.toString("utf8")))
        } catch (err) {
          done(err as Error)
        }
      },
    )

    webhook.post(
      "/payments/webhook/razorpay",
      {
        schema: {
          tags: ["Payments"],
          summary: "Razorpay inbound webhook",
          // No bearerAuth — verified by HMAC signature
        },
        // No requireAuth — this is an inbound webhook from Razorpay
      },
      async (req, reply) => {
        // ── 1. Verify signature ───────────────────────────────────────────────
        const signature = req.headers["x-razorpay-signature"] as string | undefined
        if (!signature) {
          return reply.status(401).send({ ok: false, message: "Missing X-Razorpay-Signature header" })
        }

        const secret = process.env["RAZORPAY_WEBHOOK_SECRET"]
        if (!secret) {
          req.log.warn("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured")
          return reply.status(500).send({ ok: false, message: "Webhook verification not configured" })
        }

        const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody
        if (!rawBody) {
          return reply.status(400).send({ ok: false, message: "Raw body unavailable" })
        }

        // verifyRazorpaySignature returns Effect<void, UnauthorizedError>
        const verifyExit = await req.server.effectRuntime.runPromiseExit(
          verifyRazorpaySignature(rawBody, signature, secret)
        )
        if (verifyExit._tag === "Failure") {
          return reply.status(401).send({ ok: false, message: "Invalid webhook signature" })
        }

        // ── 2. Extract and persist payment data ───────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = req.body as Record<string, any>
        const event: string = payload["event"] ?? "unknown"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paymentEntity = payload["payload"]?.["payment"]?.["entity"] as Record<string, any> | undefined

        if (!paymentEntity) {
          req.log.info({ event }, "[razorpay-webhook] no payment entity in payload — ignoring")
          return reply.send({ ok: true })
        }

        const razorpayPaymentId: string = paymentEntity["id"] ?? ""
        const razorpayOrderId: string = paymentEntity["order_id"] ?? ""
        const amount: string = String((paymentEntity["amount"] ?? 0) / 100) // paise → rupees
        const currency: string = paymentEntity["currency"] ?? "INR"
        const method: string = paymentEntity["method"] ?? ""
        const notes = (paymentEntity["notes"] ?? {}) as Record<string, unknown>

        // Map Razorpay event to local status
        const statusMap: Record<string, string> = {
          "payment.captured": "completed",
          "payment.failed": "failed",
          "payment.authorized": "pending",
          "refund.created": "refunded",
          "refund.processed": "refunded",
        }
        const status = statusMap[event] ?? "pending"

        // Extract userId from order notes (set at order creation time)
        const userId = (notes["userId"] ?? notes["user_id"] ?? "00000000-0000-0000-0000-000000000000") as string

        const persistExit = await req.server.effectRuntime.runPromiseExit(
          PostgresService.pipe(
            Effect.flatMap((postgres) =>
              postgres.query((db) =>
                db
                  .insert(payments)
                  .values({
                    razorpayPaymentId,
                    razorpayOrderId,
                    userId,
                    amount,
                    currency,
                    status,
                    method,
                    gatewayResponse: paymentEntity as Record<string, unknown>,
                    metadata: { event, webhookReceivedAt: new Date().toISOString() },
                    ...(status === "completed" ? { paidAt: new Date() } : {}),
                    ...(status === "failed" ? { failedAt: new Date() } : {}),
                  })
                  .onConflictDoUpdate({
                    target: payments.razorpayPaymentId,
                    set: {
                      status,
                      gatewayResponse: paymentEntity as Record<string, unknown>,
                      updatedAt: new Date(),
                      ...(status === "completed" ? { paidAt: new Date() } : {}),
                      ...(status === "failed" ? { failedAt: new Date() } : {}),
                    },
                  })
                  .returning()
              ).pipe(
                Effect.mapError((e) => new ExternalServiceError({ service: "postgres", cause: e }))
              )
            )
          )
        )

        if (persistExit._tag === "Failure") {
          req.log.error({ event, razorpayPaymentId }, "[razorpay-webhook] failed to persist payment")
          // Still return 200 to Razorpay — don't trigger retries for DB errors
          return reply.send({ ok: true })
        }

        req.log.info({ event, razorpayPaymentId, status }, "[razorpay-webhook] payment upserted")
        return reply.send({ ok: true })
      },
    )
  })
}
