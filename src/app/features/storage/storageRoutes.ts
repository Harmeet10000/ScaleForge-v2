/**
 * src/app/features/storage/storageRoutes.ts
 *
 * S3 object storage endpoints.
 *
 * Endpoints:
 *   POST   /storage/presign/upload    — get presigned PUT URL (auth required)
 *   POST   /storage/presign/download  — get presigned GET URL (auth required)
 *   DELETE /storage/object            — delete an object (auth required)
 *   GET    /storage/public/:key       — get public HTTPS URL (auth required)
 *
 * S3 errors (S3UploadError, S3PresignError, S3DeleteError) are NOT in the
 * AppError union — they are mapped to ExternalServiceError at call sites.
 */

import type { FastifyInstance } from "fastify"
import { Effect, Result, Schema } from "effect"
import { requireAuth } from "../auth2/authMiddleware.ts"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import { S3Service } from "../../../infra/s3/s3Service.ts"
import {
  ValidationError,
  ExternalServiceError,
} from "../../../core/errors/commonErrors.ts"

// ── Schemas ───────────────────────────────────────────────────────────────────

const PresignUploadBody = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty()),
  contentType: Schema.String.check(Schema.isNonEmpty()),
  expiresIn: Schema.optionalKey(
    Schema.Number.check(Schema.isBetween({ minimum: 60, maximum: 86_400 }))
  ),
})

const PresignDownloadBody = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty()),
  expiresIn: Schema.optionalKey(
    Schema.Number.check(Schema.isBetween({ minimum: 60, maximum: 86_400 }))
  ),
})

const DeleteObjectBody = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty()),
})

// ── Routes ────────────────────────────────────────────────────────────────────

export const storageRoutes = async (fastify: FastifyInstance) => {
  // POST /api/v1/storage/presign/upload — presigned PUT URL for client-side uploads
  fastify.post("/storage/presign/upload", {
    schema: {
      tags: ["Storage"],
      summary: "Get presigned PUT URL for direct S3 upload",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const s3 = yield* S3Service

      const bodyResult = Schema.decodeUnknownResult(PresignUploadBody)(req.body)
      if (Result.isFailure(bodyResult)) {
        return yield* Effect.fail(new ValidationError({ field: "body", message: "Invalid request body" }))
      }
      const { key, contentType, expiresIn } = bodyResult.success

      const url = yield* s3
        .presignPut({
          key,
          contentType,
          ...(expiresIn !== undefined ? { expiresIn } : {}),
        })
        .pipe(Effect.mapError((e) => new ExternalServiceError({ service: "s3", cause: e })))

      return { url, key, expiresIn: expiresIn ?? 3600 }
    }))
  })

  // POST /api/v1/storage/presign/download — presigned GET URL
  fastify.post("/storage/presign/download", {
    schema: {
      tags: ["Storage"],
      summary: "Get presigned GET URL for S3 object download",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const s3 = yield* S3Service

      const bodyResult = Schema.decodeUnknownResult(PresignDownloadBody)(req.body)
      if (Result.isFailure(bodyResult)) {
        return yield* Effect.fail(new ValidationError({ field: "body", message: "Invalid request body" }))
      }
      const { key, expiresIn } = bodyResult.success

      const url = yield* s3
        .presignGet({
          key,
          ...(expiresIn !== undefined ? { expiresIn } : {}),
        })
        .pipe(Effect.mapError((e) => new ExternalServiceError({ service: "s3", cause: e })))

      return { url, key, expiresIn: expiresIn ?? 3600 }
    }))
  })

  // DELETE /api/v1/storage/object — delete an S3 object
  fastify.delete("/storage/object", {
    schema: {
      tags: ["Storage"],
      summary: "Delete an S3 object",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const s3 = yield* S3Service

      const bodyResult = Schema.decodeUnknownResult(DeleteObjectBody)(req.body)
      if (Result.isFailure(bodyResult)) {
        return yield* Effect.fail(new ValidationError({ field: "body", message: "key is required" }))
      }
      const { key } = bodyResult.success

      yield* s3
        .delete(key)
        .pipe(Effect.mapError((e) => new ExternalServiceError({ service: "s3", cause: e })))

      return { deleted: true, key }
    }))
  })

  // GET /api/v1/storage/public/:key — public HTTPS URL (public bucket only)
  fastify.get("/storage/public/:key", {
    schema: {
      tags: ["Storage"],
      summary: "Get public HTTPS URL for an S3 object",
      security: [{ bearerAuth: [] }],
    },
    preHandler: requireAuth,
  }, async (req, reply) => {
    return effectHandler(req, reply, Effect.gen(function* () {
      const s3 = yield* S3Service
      const { key } = req.params as { key: string }
      const url = s3.publicUrl(key)
      return { url, key }
    }))
  })
}
