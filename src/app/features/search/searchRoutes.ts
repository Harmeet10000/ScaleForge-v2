/**
 * src/app/features/search/searchRoutes.ts
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
import { Effect } from "effect"
import { SearchService } from "./searchService.ts"
import { requireAuth } from "../auth/authMiddleware.ts"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"

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
    return effectHandler(request, reply,
      Effect.flatMap(SearchService, (s) => s.ingestDocument(request.body)) as Effect.Effect<unknown, AppError, never>,
      { statusCode: 202 },
    )
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
    return effectHandler(request, reply,
      Effect.flatMap(SearchService, (s) => s.getJobStatus(request.params.jobId)) as Effect.Effect<unknown, AppError, never>,
    )
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
    return effectHandler(request, reply,
      Effect.flatMap(SearchService, (s) => s.hybridSearch(request.body)) as Effect.Effect<unknown, AppError, never>,
      {
        transform: (results, reply) => {
          const arr = results as Array<unknown>
          void reply.send({ success: true, data: { results: arr, count: arr.length } })
        },
      },
    )
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
    return effectHandler(request, reply,
      Effect.flatMap(SearchService, (s) => s.suggest(request.body)) as Effect.Effect<unknown, AppError, never>,
      {
        transform: (suggestions, reply) => {
          const arr = suggestions as Array<unknown>
          void reply.send({ success: true, data: { suggestions: arr, count: arr.length } })
        },
      },
    )
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

    return effectHandler(request, reply,
      Effect.flatMap(SearchService, (s) => s.deleteDocument(documentId, tenantId)) as Effect.Effect<unknown, AppError, never>,
      {
        transform: (_, reply, req) => {
          void reply.send({ success: true, data: { deleted: true, documentId: (req.params as { documentId: string }).documentId } })
        },
      },
    )
  })

  // ── GET /health ─────────────────────────────────────────────────────────────

  fastify.get("/health", {
    schema: {
      tags: ["Search"],
      summary: "Search extension availability check",
    },
  }, async (request, reply) => {
    return effectHandler(request, reply,
      Effect.flatMap(SearchService, (s) => s.healthCheck()),
      {
        transform: (data, reply) => {
          void reply.status((data as { healthy: boolean }).healthy ? 200 : 503).send({ success: (data as { healthy: boolean }).healthy, data })
        },
      },
    )
  })
}
