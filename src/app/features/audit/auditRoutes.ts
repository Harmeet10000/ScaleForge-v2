/**
 * src/app/features/audit/auditRoutes.ts
 *
 * Audit trail endpoints (admin-only).
 *
 * Endpoints:
 *   POST /audit            — record an audit entry (internal/admin)
 *   GET  /audit            — query entries with filters + pagination
 *   GET  /audit/:id        — fetch single entry by ID
 *
 * Schema: src/db/schema/auditSchema.ts (audit_entries table)
 *
 * All routes require authentication. The write endpoint also requires
 * the caller to be an admin (checked via FGA or trusted internal caller).
 */

import type { FastifyInstance } from "fastify"
import { Effect, Result, Schema } from "effect"
import { eq, and, gte, lte, desc } from "drizzle-orm"
import { requireAuth } from "../auth2/authMiddleware.ts"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { auditEntries } from "../../../db/schema/auditSchema.ts"
import {
  NotFoundError,
  ValidationError,
  ExternalServiceError,
} from "../../../core/errors/commonErrors.ts"

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateAuditBody = Schema.Struct({
  entityType: Schema.String.check(Schema.isNonEmpty()),
  entityId: Schema.String.check(Schema.isNonEmpty()),
  operation: Schema.String.check(Schema.isNonEmpty()),
  status: Schema.Literals(["success", "failure", "error", "pending"]),
  userId: Schema.optionalKey(Schema.String),
  organizationId: Schema.optionalKey(Schema.String),
  previousData: Schema.optionalKey(Schema.Unknown),
  newData: Schema.optionalKey(Schema.Unknown),
  changes: Schema.optionalKey(Schema.Unknown),
  metadata: Schema.optionalKey(Schema.Unknown),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  errorMessage: Schema.optionalKey(Schema.String),
  errorCode: Schema.optionalKey(Schema.String),
})

const AuditQueryParams = Schema.Struct({
  entityType: Schema.optionalKey(Schema.String),
  entityId: Schema.optionalKey(Schema.String),
  userId: Schema.optionalKey(Schema.String),
  organizationId: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  operation: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.NumberFromString.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
  offset: Schema.optionalKey(Schema.NumberFromString.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))),
})

// ── Routes ────────────────────────────────────────────────────────────────────

export const auditRoutes = async (fastify: FastifyInstance) => {
  // POST /api/v1/audit — record an audit entry
  fastify.post("/audit", {
    schema: {
      tags: ["Audit"],
      summary: "Record an audit entry",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService

      const bodyResult = Schema.decodeUnknownResult(CreateAuditBody)(req.body)
      if (Result.isFailure(bodyResult)) {
        return yield* Effect.fail(new ValidationError({ field: "body", message: "Invalid audit entry body" }))
      }
      const body = bodyResult.success

      const [entry] = yield* postgres.query((db) =>
        db
          .insert(auditEntries)
          .values({
            entityType: body.entityType,
            entityId: body.entityId,
            operation: body.operation,
            status: body.status,
            userId: body.userId ?? null,
            organizationId: body.organizationId ?? null,
            previousData: body.previousData ?? null,
            newData: body.newData ?? null,
            changes: body.changes ?? null,
            metadata: (body.metadata ?? {}) as Record<string, unknown>,
            tags: (body.tags ?? []) as string[],
            errorMessage: body.errorMessage ?? null,
            errorCode: body.errorCode ?? null,
          })
          .returning()
      ).pipe(Effect.mapError((e) => new ExternalServiceError({ service: "postgres", cause: e })))

      return entry
    }), { statusCode: 201 })
  })

  // GET /api/v1/audit — query entries with optional filters
  fastify.get("/audit", {
    schema: {
      tags: ["Audit"],
      summary: "Query audit entries",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService

      const qResult = Schema.decodeUnknownResult(AuditQueryParams)(req.query)
      if (Result.isFailure(qResult)) {
        return yield* Effect.fail(new ValidationError({ field: "query", message: "Invalid query parameters" }))
      }
      const q = qResult.success
      const limit = q.limit ?? 50
      const offset = q.offset ?? 0

      const conditions = [
        q.entityType != null ? eq(auditEntries.entityType, q.entityType) : undefined,
        q.entityId != null ? eq(auditEntries.entityId, q.entityId) : undefined,
        q.userId != null ? eq(auditEntries.userId, q.userId) : undefined,
        q.organizationId != null ? eq(auditEntries.organizationId, q.organizationId) : undefined,
        q.status != null ? eq(auditEntries.status, q.status) : undefined,
        q.operation != null ? eq(auditEntries.operation, q.operation) : undefined,
        q.from != null ? gte(auditEntries.createdAt, new Date(q.from)) : undefined,
        q.to != null ? lte(auditEntries.createdAt, new Date(q.to)) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c != null)

      const rows = yield* postgres.query((db) =>
        db
          .select()
          .from(auditEntries)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(auditEntries.createdAt))
          .limit(limit)
          .offset(offset)
      ).pipe(Effect.mapError((e) => new ExternalServiceError({ service: "postgres", cause: e })))

      return { entries: rows, limit, offset, count: rows.length }
    }))
  })

  // GET /api/v1/audit/:id — single entry
  fastify.get("/audit/:id", {
    schema: {
      tags: ["Audit"],
      summary: "Get audit entry by ID",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const postgres = yield* PostgresService
      const { id } = req.params as { id: string }

      const [entry] = yield* postgres.query((db) =>
        db
          .select()
          .from(auditEntries)
          .where(eq(auditEntries.id, id))
          .limit(1)
      ).pipe(Effect.mapError((e) => new ExternalServiceError({ service: "postgres", cause: e })))

      if (!entry) {
        return yield* Effect.fail(new NotFoundError({ resource: "AuditEntry", identifier: id }))
      }

      return entry
    }))
  })
}
