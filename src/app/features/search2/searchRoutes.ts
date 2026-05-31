/**
 * src/app/features/search2/searchRoutes.ts
 *
 * Fastify plugin: /api/v1/search routes.
 *
 * POST /ingest          — queue document for async chunk+embed
 * GET  /ingest/:jobId   — poll ingest job status
 * POST /hybrid          — hybrid BM25+vector+trigram search (RRF)
 * POST /suggest         — fast trigram title autocomplete
 * DELETE /document/:id  — remove document + all chunks (CASCADE)
 * GET  /health          — extension availability check
 */

import type { FastifyInstance } from "fastify"
import { Effect, Cause, Result } from "effect"
import { SearchService } from "./searchService.ts"
import { requireAuth } from "../auth2/authMiddleware.ts"
import { toHttpError } from "../../../core/errors/httpErrors.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"

// ── Helper: run Effect and map to HTTP response ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runSearch = async <A>(
  fastify: FastifyInstance,
  // R is provided by effectRuntime — `any` avoids the exactOptionalPropertyTypes constraint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect: Effect.Effect<A, AppError, any>,
) => {
  const exit = await fastify.effectRuntime.runPromiseExit(effect as Effect.Effect<A, AppError, never>)
  if (exit._tag === "Success") return { ok: true as const, value: exit.value }
  const errResult = Cause.findError(exit.cause)
  if (Result.isSuccess(errResult)) {
    return { ok: false as const, http: toHttpError(errResult.success as AppError) }
  }
  return { ok: false as const, http: { success: false, statusCode: 500, message: "Internal server error", data: null } as const }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const searchRoutes = async (fastify: FastifyInstance): Promise<void> => {

  // ── POST /ingest ────────────────────────────────────────────────────────────

  fastify.post<{
    Body: {
      title: string
      content: string
      tenantId: string
      entityType?: string
      entityId?: string
      docMetadata?: Record<string, unknown>
    }
  }>("/ingest", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Search"],
      summary: "Queue a document for async chunk+embed ingest",
      body: {
        type: "object",
        required: ["title", "content", "tenantId"],
        properties: {
          title:       { type: "string", minLength: 1, maxLength: 500 },
          content:     { type: "string", minLength: 1 },
          tenantId:    { type: "string" },
          entityType:  { type: "string" },
          entityId:    { type: "string" },
          docMetadata: { type: "object" },
        },
      },
    },
  }, async (request, reply) => {
    const res = await runSearch(
      fastify,
      Effect.flatMap(SearchService, (s) => s.ingestDocument(request.body) as Effect.Effect<unknown, AppError>)
    )
    if (!res.ok) return reply.status(res.http!.statusCode).send(res.http)
    return reply.status(202).send({ success: true, data: res.value })
  })

  // ── GET /ingest/:jobId ──────────────────────────────────────────────────────

  fastify.get<{ Params: { jobId: string } }>("/ingest/:jobId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Search"],
      summary: "Poll async ingest job status",
      params: {
        type: "object",
        required: ["jobId"],
        properties: { jobId: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const res = await runSearch(
      fastify,
      Effect.flatMap(SearchService, (s) => s.getJobStatus(request.params.jobId) as Effect.Effect<unknown, AppError>)
    )
    if (!res.ok) return reply.status(res.http!.statusCode).send(res.http)
    return reply.send({ success: true, data: res.value })
  })

  // ── POST /hybrid ────────────────────────────────────────────────────────────

  fastify.post<{
    Body: {
      query: string
      tenantId: string
      entityType?: string
      limit?: number
      candidateLimit?: number
      metadataFilter?: Record<string, unknown>
      bypassCache?: boolean
    }
  }>("/hybrid", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Search"],
      summary: "Hybrid BM25 + vector + trigram search with RRF fusion",
      body: {
        type: "object",
        required: ["query", "tenantId"],
        properties: {
          query:          { type: "string", minLength: 1, maxLength: 1000 },
          tenantId:       { type: "string" },
          entityType:     { type: "string" },
          limit:          { type: "integer", minimum: 1, maximum: 100, default: 20 },
          candidateLimit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          metadataFilter: { type: "object" },
          bypassCache:    { type: "boolean", default: false },
        },
      },
    },
  }, async (request, reply) => {
    const res = await runSearch(
      fastify,
      Effect.flatMap(SearchService, (s) => s.hybridSearch(request.body) as Effect.Effect<unknown, AppError>)
    )
    if (!res.ok) return reply.status(res.http!.statusCode).send(res.http)
    const results = res.value as Array<unknown>
    return reply.send({
      success: true,
      data: { results, count: results.length },
    })
  })

  // ── POST /suggest ───────────────────────────────────────────────────────────

  fastify.post<{
    Body: { query: string; tenantId: string; entityType?: string; limit?: number }
  }>("/suggest", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Search"],
      summary: "Fast trigram title autocomplete",
      body: {
        type: "object",
        required: ["query", "tenantId"],
        properties: {
          query:      { type: "string", minLength: 1, maxLength: 200 },
          tenantId:   { type: "string" },
          entityType: { type: "string" },
          limit:      { type: "integer", minimum: 1, maximum: 20, default: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const res = await runSearch(
      fastify,
      Effect.flatMap(SearchService, (s) => s.suggest(request.body) as Effect.Effect<unknown, AppError>)
    )
    if (!res.ok) return reply.status(res.http!.statusCode).send(res.http)
    const suggestions = res.value as Array<unknown>
    return reply.send({ success: true, data: { suggestions, count: suggestions.length } })
  })

  // ── DELETE /document/:documentId ────────────────────────────────────────────

  fastify.delete<{
    Params: { documentId: string }
    Querystring: { tenantId: string }
  }>("/document/:documentId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Search"],
      summary: "Delete a document and all its chunks",
      params: {
        type: "object",
        required: ["documentId"],
        properties: { documentId: { type: "string" } },
      },
      querystring: {
        type: "object",
        required: ["tenantId"],
        properties: { tenantId: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { documentId } = request.params
    const { tenantId } = request.query

    const res = await runSearch(
      fastify,
      Effect.flatMap(SearchService, (s) =>
        s.deleteDocument(documentId, tenantId) as Effect.Effect<unknown, AppError>
      )
    )
    if (!res.ok) return reply.status(res.http!.statusCode).send(res.http)
    return reply.send({ success: true, data: { deleted: true, documentId } })
  })

  // ── GET /health ─────────────────────────────────────────────────────────────

  fastify.get("/health", {
    schema: {
      tags: ["Search"],
      summary: "Search extension availability check",
    },
  }, async (_request, reply) => {
    const exit = await fastify.effectRuntime.runPromiseExit(
      Effect.flatMap(SearchService, (s) => s.healthCheck())
    )
    if (exit._tag === "Success") {
      const data = exit.value
      return reply
        .status(data.healthy ? 200 : 503)
        .send({ success: data.healthy, data })
    }
    return reply.status(503).send({ success: false, data: null })
  })
}
