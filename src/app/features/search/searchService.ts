/**
 * src/app/features/search/searchService.ts
 *
 * Effect layer: search business logic.
 *
 * Depends on: PostgresService, RedisService, GeminiService, RabbitMQService
 *
 * Operations:
 *   ingestDocument  — SHA-256 dedup → insert doc → publish RabbitMQ ingest job
 *   hybridSearch    — Redis cache → embed query → RRF CTE → cache + return
 *   suggest         — trigram title autocomplete (no embedding)
 *   deleteDocument  — delete doc + CASCADE chunks
 *   getJobStatus    — read Redis job key
 *   healthCheck     — verify pg_trgm, pgvector, pg_textsearch installed
 */

import { Context, Effect, Layer } from "effect"
import { v4 as uuidv4 } from "uuid"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { RedisService } from "../../../infra/redis/redisService.ts"
import { GeminiService } from "../../../infra/gemini/geminiService.ts"
import { RabbitMQService } from "../../../infra/rabbitmq/rabbitmqService.ts"
import {
  SearchDocumentNotFoundError,
  SearchQueryTooLongError,
  SearchTenantRequiredError,
  SearchIngestError,
  SearchJobNotFoundError,
} from "./searchErrors.ts"
import { HealthCheckError } from "../../../core/errors/infraErrors.ts"
import {
  hybridSearch,
  suggestDocuments,
  findDocumentByHash,
  insertDocument,
  deleteDocument,
  checkExtensions,
  type SearchResultRow,
  type SuggestResultRow,
} from "./searchRepository.ts"
import { normalizeText, sha256Hex } from "./searchChunking.ts"
import { encodeRedis, decodeRedis } from "../../../infra/redis/redisCodec.ts"

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_INGEST = "search.ingest"
const CACHE_TTL = 900            // 15 min
const MAX_QUERY_LENGTH = 1000
const DEFAULT_LIMIT = 20
const DEFAULT_CANDIDATE_LIMIT = 50
const DEFAULT_SUGGEST_LIMIT = 10

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface SearchIngestInput {
  readonly title: string
  readonly content: string
  readonly tenantId: string
  readonly entityType?: string
  readonly entityId?: string | null
  readonly docMetadata?: Record<string, unknown>
}

export interface SearchIngestResult {
  readonly documentId: string
  readonly jobId: string
  readonly status: "queued" | "duplicate"
  readonly duplicate: boolean
}

export interface HybridSearchInput {
  readonly query: string
  readonly tenantId: string
  readonly entityType?: string | null
  readonly limit?: number
  readonly candidateLimit?: number
  readonly metadataFilter?: Record<string, unknown> | null
  readonly bypassCache?: boolean
}

export interface SuggestInput {
  readonly query: string
  readonly tenantId: string
  readonly entityType?: string | null
  readonly limit?: number
}

export interface JobStatus {
  readonly jobId: string
  readonly status: "queued" | "processing" | "completed" | "failed"
  readonly chunkCount?: number
  readonly error?: string
}

export interface SearchHealthResult {
  readonly healthy: boolean
  readonly extensions: {
    readonly pgTrgm: boolean
    readonly pgvector: boolean
    readonly pgTextsearch: boolean
  }
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface SearchService {
  readonly ingestDocument: (
    input: SearchIngestInput,
  ) => Effect.Effect<SearchIngestResult, SearchTenantRequiredError | SearchIngestError>

  readonly hybridSearch: (
    input: HybridSearchInput,
  ) => Effect.Effect<SearchResultRow[], SearchQueryTooLongError | SearchTenantRequiredError>

  readonly suggest: (
    input: SuggestInput,
  ) => Effect.Effect<SuggestResultRow[], SearchTenantRequiredError>

  readonly deleteDocument: (
    documentId: string,
    tenantId: string,
  ) => Effect.Effect<void, SearchDocumentNotFoundError>

  readonly getJobStatus: (
    jobId: string,
  ) => Effect.Effect<JobStatus, SearchJobNotFoundError>

  readonly healthCheck: () => Effect.Effect<SearchHealthResult, HealthCheckError>
}

export const SearchService = Context.Service<SearchService>("@search/SearchService")

// ── Cache helpers ─────────────────────────────────────────────────────────────

/** Recursively sort object keys for deterministic JSON.stringify fingerprinting. */
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    )
  }
  return value
}

const buildCacheKey = async (input: HybridSearchInput): Promise<string> => {
  const fingerprint = JSON.stringify({
    q: input.query,
    et: input.entityType ?? null,
    l: input.limit ?? DEFAULT_LIMIT,
    cl: input.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT,
    mf: input.metadataFilter != null ? sortKeys(input.metadataFilter) : null,
  })
  const hash = await sha256Hex(fingerprint)
  return `search:${input.tenantId}:${hash}`
}

const buildJobKey = (jobId: string): string => `search:job:${jobId}`

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const postgres = yield* PostgresService
  const redis = yield* RedisService
  const gemini = yield* GeminiService
  const rabbit = yield* RabbitMQService

  // ── ingestDocument ──────────────────────────────────────────────────────────

  const ingestDocument = (input: SearchIngestInput) =>
    Effect.gen(function* () {
      if (!input.tenantId) return yield* Effect.fail(new SearchTenantRequiredError())

      const normalised = normalizeText(input.content)
      const contentHash = yield* Effect.tryPromise({
        try: () => sha256Hex(normalised),
        catch: (cause) => new SearchIngestError({ cause }),
      })

      // Dedup check
      const existing = yield* postgres.query((db) =>
        findDocumentByHash(db, input.tenantId, contentHash)
      ).pipe(Effect.orDie)

      if (existing !== null) {
        const jobId = uuidv4()
        return {
          documentId: existing.id,
          jobId,
          status: "duplicate" as const,
          duplicate: true,
        }
      }

      // Insert document record
      const documentId = yield* postgres.query((db) =>
        insertDocument(db, {
          tenantId: input.tenantId,
          entityType: input.entityType ?? "document",
          entityId: input.entityId ?? null,
          title: input.title,
          content: normalised,
          contentHash,
          docMetadata: input.docMetadata ?? {},
        })
      ).pipe(
        Effect.mapError((cause) => new SearchIngestError({ cause }))
      )

      // Publish ingest job to RabbitMQ worker
      const jobId = uuidv4()
      yield* rabbit.publish("", QUEUE_INGEST, {
        jobId,
        documentId,
        content: normalised,
        tenantId: input.tenantId,
      }).pipe(
        Effect.mapError((cause) => new SearchIngestError({ cause }))
      )

      // Track job status in Redis
      yield* redis.setBuffer(
        buildJobKey(jobId),
        encodeRedis({ status: "queued", documentId }),
        86400, // 24h TTL
      ).pipe(Effect.ignore)

      return {
        documentId,
        jobId,
        status: "queued" as const,
        duplicate: false,
      }
    })

  // ── hybridSearch ────────────────────────────────────────────────────────────

  const hybridSearch_ = (input: HybridSearchInput) =>
    Effect.gen(function* () {
      if (!input.tenantId) return yield* Effect.fail(new SearchTenantRequiredError())
      if (input.query.length > MAX_QUERY_LENGTH) {
        return yield* Effect.fail(
          new SearchQueryTooLongError({ length: input.query.length, maxLength: MAX_QUERY_LENGTH })
        )
      }

      const limit = Math.min(input.limit ?? DEFAULT_LIMIT, 100)
      const candidateLimit = Math.min(input.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT, 200)

      // Cache read
      if (!input.bypassCache) {
        const cacheKey = yield* Effect.promise(() =>
          buildCacheKey(input).catch(() => null as string | null)
        )
        if (cacheKey !== null) {
          const cached = yield* redis.getBuffer(cacheKey).pipe(
            Effect.orElseSucceed(() => null as Buffer | null)
          )
          if (cached !== null) {
            return decodeRedis<SearchResultRow[]>(cached)
          }
        }
      }

      // Embed query for vector signal
      const embedding = yield* gemini.embedOne(
        input.query,
        "RETRIEVAL_QUERY",
      ).pipe(
        Effect.orElseSucceed(() => null as number[] | null)
      )

      // Run hybrid search
      const results = yield* postgres.query((db) =>
        hybridSearch(db, {
          query: input.query,
          embedding,
          tenantId: input.tenantId,
          entityType: input.entityType ?? null,
          limit,
          candidateLimit,
          metadataFilter: input.metadataFilter ?? null,
        })
      ).pipe(Effect.orDie)

      // Cache write (fire-and-forget)
      if (!input.bypassCache) {
        const cacheKey = yield* Effect.promise(() =>
          buildCacheKey(input).catch(() => null as string | null)
        )
        if (cacheKey !== null) {
          yield* redis.setBuffer(cacheKey, encodeRedis(results), CACHE_TTL).pipe(Effect.ignore)
        }
      }

      return results
    })

  // ── suggest ─────────────────────────────────────────────────────────────────

  const suggest = (input: SuggestInput) =>
    Effect.gen(function* () {
      if (!input.tenantId) return yield* Effect.fail(new SearchTenantRequiredError())

      return yield* postgres.query((db) =>
        suggestDocuments(db, {
          query: input.query,
          tenantId: input.tenantId,
          entityType: input.entityType ?? null,
          limit: Math.min(input.limit ?? DEFAULT_SUGGEST_LIMIT, 20),
        })
      ).pipe(Effect.orDie)
    })

  // ── deleteDocument ──────────────────────────────────────────────────────────

  const deleteDocument_ = (documentId: string, tenantId: string) =>
    Effect.gen(function* () {
      const deleted = yield* postgres.query((db) =>
        deleteDocument(db, documentId, tenantId)
      ).pipe(Effect.orDie)

      if (!deleted) {
        return yield* Effect.fail(new SearchDocumentNotFoundError({ documentId }))
      }
    })

  // ── getJobStatus ────────────────────────────────────────────────────────────

  const getJobStatus = (jobId: string) =>
    Effect.gen(function* () {
      const raw = yield* redis.getBuffer(buildJobKey(jobId)).pipe(
        Effect.orElseSucceed(() => null as Buffer | null)
      )
      if (raw === null) {
        return yield* Effect.fail(new SearchJobNotFoundError({ jobId }))
      }
      const parsed = decodeRedis<Omit<JobStatus, "jobId">>(raw)
      return { jobId, ...parsed } satisfies JobStatus
    })

  // ── healthCheck ─────────────────────────────────────────────────────────────

  const healthCheck = () =>
    Effect.gen(function* () {
      const exts = yield* postgres.query((db) => checkExtensions(db)).pipe(
        Effect.mapError((cause) => new HealthCheckError({ component: "search-extensions", cause }))
      )
      return {
        healthy: exts.pgTrgm && exts.pgvector,
        extensions: exts,
      } satisfies SearchHealthResult
    })

  return SearchService.of({
    ingestDocument,
    hybridSearch: hybridSearch_,
    suggest,
    deleteDocument: deleteDocument_,
    getJobStatus,
    healthCheck,
  })
})

export const SearchServiceLive = Layer.effect(SearchService, make)
