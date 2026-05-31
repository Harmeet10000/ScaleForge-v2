/**
 * src/workers/searchIngestWorker.ts
 *
 * Background worker: chunk + embed + upsert documents into PostgreSQL search.
 *
 * Queue:   "search.ingest"
 * Message: { jobId, documentId, content, tenantId }
 *
 * Pipeline per message:
 *   1. Decode + validate message
 *   2. Split content into 512-word overlapping chunks (overlap=64)
 *   3. Batch embed chunks via Gemini gemini-embedding-001 (200/batch, 3 concurrent)
 *   4. Upsert search_chunks (ON CONFLICT document_id+chunk_index DO UPDATE)
 *   5. If total chunks > 10k: ANALYZE search_chunks
 *   6. Update Redis job status → { status: 'completed', chunkCount }
 *
 * Error path:
 *   - Embedding failure → SET job { status: 'failed', error } → nack (→ DLQ after 3)
 *   - DB failure → nack (→ DLQ after 3)
 *
 * Health: raw HTTP on WORKER_HEALTH_PORT (default 9105)
 * Graceful shutdown: close-with-grace with 10s deadline
 */

import { Effect, ManagedRuntime, Queue, Schema, Result, Fiber, Layer } from "effect"
import closeWithGrace from "close-with-grace"
import { PostgresService } from "../infra/postgres/postgresService.ts"
import { RedisService } from "../infra/redis/redisService.ts"
import { GeminiService } from "../infra/gemini/geminiService.ts"
import { RabbitConsumerService, RabbitConsumerServiceLive } from "./shared/rabbitConsumer.ts"
import { DLQService, DLQServiceLive } from "./shared/dlqService.ts"
import { WorkerLayer } from "./shared/workerLayer.ts"
import { makeWorkerHealth } from "./shared/workerHealth.ts"
import { AppConfigLive } from "../core/config/configService.ts"
import { PostgresServiceLive } from "../infra/postgres/postgresService.ts"
import { RedisServiceLive } from "../infra/redis/redisService.ts"
import { GeminiServiceLive } from "../infra/gemini/geminiService.ts"
import { chunkText, normalizeText } from "../app/features/search2/searchChunking.ts"
import { upsertChunks, countChunksForDocument, analyzeChunks } from "../app/features/search2/searchRepository.ts"

// ── Message schema ─────────────────────────────────────────────────────────────

const SearchIngestMessage = Schema.Struct({
  jobId:      Schema.String.check(Schema.isNonEmpty()),
  documentId: Schema.String.check(Schema.isNonEmpty()),
  content:    Schema.String.check(Schema.isNonEmpty()),
  tenantId:   Schema.String.check(Schema.isNonEmpty()),
})
type SearchIngestMessage = Schema.Schema.Type<typeof SearchIngestMessage>

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_NAME    = "search.ingest"
const WORKER_NAME   = "search-ingest"
const PREFETCH      = 3          // embedding calls are expensive; keep concurrency low
const CHUNK_SIZE    = 512
const CHUNK_OVERLAP = 64
const EMBED_BATCH   = 200        // max texts per Gemini embedContent call
const MAX_EMBED_CONCURRENCY = 3  // max parallel embedding batches

// ── Job Redis key ─────────────────────────────────────────────────────────────

const jobKey = (jobId: string) => `search:job:${jobId}`
const JOB_TTL = 86_400 // 24h

// ── Process one message ────────────────────────────────────────────────────────

const processMessage = (
  msg: SearchIngestMessage,
  ack: () => Effect.Effect<void>,
  nack: () => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const postgres = yield* PostgresService
    const redis    = yield* RedisService
    const gemini   = yield* GeminiService

    // Mark job as processing
    yield* redis.set(jobKey(msg.jobId), JSON.stringify({ status: "processing", documentId: msg.documentId }), JOB_TTL)
      .pipe(Effect.ignore)

    // 1. Chunk text
    const normalised = normalizeText(msg.content)
    const chunks = chunkText(normalised, { size: CHUNK_SIZE, overlap: CHUNK_OVERLAP })

    if (chunks.length === 0) {
      yield* Effect.log(`[search-ingest] empty content for documentId=${msg.documentId} — acking`)
      yield* redis.set(jobKey(msg.jobId), JSON.stringify({ status: "completed", chunkCount: 0 }), JOB_TTL)
        .pipe(Effect.ignore)
      yield* ack()
      return
    }

    // 2. Batch embed (EMBED_BATCH per Gemini call, MAX_EMBED_CONCURRENCY at a time)
    const allTexts = chunks.map((c) => c.text)
    const batches: string[][] = []
    for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
      batches.push(allTexts.slice(i, i + EMBED_BATCH))
    }

    // Process batches with limited concurrency
    const embeddings: number[][] = []
    for (let i = 0; i < batches.length; i += MAX_EMBED_CONCURRENCY) {
      const concurrentBatches = batches.slice(i, i + MAX_EMBED_CONCURRENCY)
      const batchResults = yield* Effect.all(
        concurrentBatches.map((batch) => gemini.embedBatch(batch, "RETRIEVAL_DOCUMENT")),
        { concurrency: MAX_EMBED_CONCURRENCY },
      )
      for (const result of batchResults) {
        embeddings.push(...result)
      }
    }

    // 3. Upsert chunks with embeddings
    yield* postgres.query((db) =>
      upsertChunks(
        db,
        chunks.map((chunk, i) => ({
          documentId: msg.documentId,
          chunkIndex: chunk.index,
          content: chunk.text,
          embedding: embeddings[i] ?? null,
          chunkMetadata: { wordCount: chunk.wordCount },
        })),
      )
    ).pipe(Effect.orDie)

    // 4. ANALYZE if total chunks for this document > 10k
    const totalChunks = yield* postgres.query((db) =>
      countChunksForDocument(db, msg.documentId)
    ).pipe(Effect.orDie)

    if (totalChunks > 10_000) {
      yield* postgres.query((db) => analyzeChunks(db)).pipe(Effect.ignore)
    }

    // 5. Mark job complete
    yield* redis.set(
      jobKey(msg.jobId),
      JSON.stringify({ status: "completed", chunkCount: chunks.length }),
      JOB_TTL,
    ).pipe(Effect.ignore)

    yield* ack()
    yield* Effect.log(
      `[search-ingest] completed documentId=${msg.documentId} chunks=${chunks.length} embeddings=${embeddings.length}`
    )
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError("[search-ingest] failed to process message", cause)

        // Mark job as failed in Redis
        const redis = yield* RedisService
        yield* redis.set(
          jobKey(msg.jobId),
          JSON.stringify({ status: "failed", error: String(cause) }),
          JOB_TTL,
        ).pipe(Effect.ignore)

        // Send to DLQ
        const dlq = yield* DLQService
        yield* dlq.publish({
          sourceQueue: QUEUE_NAME,
          workerName: WORKER_NAME,
          body: msg,
          reason: "Unhandled error in search ingest pipeline",
          attempts: 1,
          failedAt: new Date().toISOString(),
          errorDetail: String(cause),
        })

        yield* nack()
      })
    )
  )

// ── Worker loop ───────────────────────────────────────────────────────────────

const workerProgram = Effect.gen(function* () {
  const consumer = yield* RabbitConsumerService
  const health = makeWorkerHealth({
    port: Number(process.env["WORKER_HEALTH_PORT"] ?? 9105),
  })

  const server = yield* Effect.promise(() => health.start())
  yield* Effect.log(
    `[search-ingest] health server on :${(server.address() as { port: number }).port}`
  )

  yield* Effect.addFinalizer(() =>
    Effect.promise(() => health.stop()).pipe(Effect.ignore)
  )

  const msgQueue = yield* consumer.consume({
    queue: QUEUE_NAME,
    prefetch: PREFETCH,
  })

  health.setReady(true)
  yield* Effect.log(`[search-ingest] consuming from ${QUEUE_NAME}`)

  const activeFibers = new Set<Fiber.Fiber<void, never>>()

  yield* Effect.forever(
    Effect.gen(function* () {
      const msg = yield* Queue.take(msgQueue)
      const decoded = Schema.decodeUnknownResult(SearchIngestMessage)(msg.body)

      if (!Result.isSuccess(decoded)) {
        yield* Effect.logWarning(
          "[search-ingest] invalid message schema — nacking",
          decoded.failure,
        )
        yield* msg.nack()
        return
      }

      const job = decoded.success

      const fiber = yield* Effect.forkChild(
        processMessage(job, msg.ack, msg.nack).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("[search-ingest] unhandled fiber error", cause)
          ),
        )
      )

      activeFibers.add(fiber)
      void Fiber.await(fiber).pipe(
        Effect.map(() => activeFibers.delete(fiber)),
        Effect.runFork,
      )
    })
  )
})

// ── Entry point ───────────────────────────────────────────────────────────────

const SearchIngestWorkerLayer = Layer.mergeAll(
  WorkerLayer,
  RabbitConsumerServiceLive.pipe(Layer.provide(AppConfigLive)),
  DLQServiceLive.pipe(Layer.provide(AppConfigLive)),
  PostgresServiceLive.pipe(Layer.provide(AppConfigLive)),
  RedisServiceLive.pipe(Layer.provide(AppConfigLive)),
  GeminiServiceLive.pipe(Layer.provide(AppConfigLive)),
)

const runtime = ManagedRuntime.make(SearchIngestWorkerLayer)

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) {
    console.error("[search-ingest] unexpected error — shutting down:", err)
  } else {
    console.log(`[search-ingest] received ${signal ?? "close"}, shutting down…`)
  }
  await runtime.dispose()
})

runtime.runFork(
  workerProgram.pipe(
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        console.error("[search-ingest] fatal error", cause)
        process.exit(1)
      }),
    ),
  ),
)
