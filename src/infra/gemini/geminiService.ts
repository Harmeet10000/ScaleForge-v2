/**
 * src/infra/gemini/geminiService.ts
 *
 * Effect layer wrapping @google/genai for embedding generation.
 *
 * All calls are rate-limited via geminiLimiter (Bottleneck):
 *   - 10 concurrent max, 100ms between calls
 *   - queue size 200 — callers wait rather than fail at burst
 *
 * Primary use: SearchIngestWorker → embeds text chunks before upsert to
 *   search_chunks.embedding (vector(768)) for DiskANN similarity search.
 *
 * Depends on: AppConfig (GEMINI_API_KEY)
 */

import { Context, Effect, Layer, Redacted } from "effect"
import { GoogleGenAI } from "@google/genai"
import { Data } from "effect"
import { AppConfig } from "../../core/config/configService.ts"
import { geminiLimiter } from "../rateLimit/outboundRateLimiter.ts"

// ── Errors ────────────────────────────────────────────────────────────────────

export class GeminiEmbeddingError extends Data.TaggedError("GeminiEmbeddingError")<{
  readonly model: string
  readonly inputCount: number
  readonly cause: unknown
}> {}

// ── Service interface ─────────────────────────────────────────────────────────

export interface GeminiService {
  /**
   * Embed a batch of text strings.
   * Returns an array of float vectors, one per input text.
   * Preserves input order.
   * taskType: "RETRIEVAL_DOCUMENT" for indexing, "RETRIEVAL_QUERY" for queries.
   */
  readonly embedBatch: (
    texts: string[],
    taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY"
  ) => Effect.Effect<number[][], GeminiEmbeddingError>

  /**
   * Embed a single text string.
   * Convenience wrapper around embedBatch.
   */
  readonly embedOne: (
    text: string,
    taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY"
  ) => Effect.Effect<number[], GeminiEmbeddingError>
}

export const GeminiService = Context.Service<GeminiService>("@infra/GeminiService")

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBED_MODEL = "gemini-embedding-001"
const EMBEDDING_DIMS = 768

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const config = yield* AppConfig
  const apiKey = Redacted.value(config.gemini.apiKey)

  // Stateless HTTP client — acquireRelease with trivial release
  const ai = yield* Effect.acquireRelease(
    Effect.sync(() => new GoogleGenAI({ apiKey })),
    (_client) => Effect.void,
  )

  const embedBatch = (
    texts: string[],
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" = "RETRIEVAL_DOCUMENT",
  ) =>
    Effect.tryPromise({
      try: () =>
        geminiLimiter.schedule(async () => {
          const response = await ai.models.embedContent({
            model: EMBED_MODEL,
            contents: texts,
            config: { taskType },
          })

          const embeddings = response.embeddings ?? []
          return embeddings.map((e) => {
            const values = e.values ?? []
            // Truncate to 768 dims in case the model returns more
            return values.length > EMBEDDING_DIMS ? values.slice(0, EMBEDDING_DIMS) : values
          })
        }),
      catch: (cause) =>
        new GeminiEmbeddingError({ model: EMBED_MODEL, inputCount: texts.length, cause }),
    })

  const embedOne = (
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY" = "RETRIEVAL_DOCUMENT",
  ) =>
    embedBatch([text], taskType).pipe(
      Effect.map((vecs) => vecs[0] ?? []),
    )

  return GeminiService.of({ embedBatch, embedOne })
})

export const GeminiServiceLive = Layer.effect(GeminiService, make)
