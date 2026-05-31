# Search System — PostgreSQL Migration Design

**Date:** 2026-05-31
**Status:** Approved
**Replaces:** Elasticsearch-based search (`src/app/features/search/`)

---

## 1. Problem Statement

The existing Elasticsearch search implementation has multiple known bugs (broken `executeSearch` return, commented-out auth, asyncHandler misuse), requires a separate cluster to operate, and adds operational overhead with no net benefit for a Neon PostgreSQL-first stack. We replace it with a pure-Postgres search engine using three production-ready extensions.

---

## 2. Goals

- **Replace Elasticsearch** entirely. Remove `@elastic/elasticsearch`, all ES config, pipeline management, and ES-specific query builders.
- **Hybrid search** combining BM25 + dense vector + trigram in a single SQL round-trip via RRF fusion.
- **Flipkart-scale patterns**: multi-tenant isolation, entity typing, JSONB metadata filters, async ingestion with content dedup, query result caching.
- **Fit the existing Effect v4 codebase** patterns: `Context.Service`, `Layer.effect`, `Effect.gen`, Drizzle ORM, RabbitMQ worker, Redis cache.

---

## 3. Technology Stack

| Concern | Technology |
|---|---|
| BM25 full-text | `pg_textsearch` — `USING bm25(content)` index, `<@>` operator |
| Vector similarity | `pgvector` + `pgvectorscale` — DiskANN index, `<=>` cosine |
| Fuzzy / partial match | `pg_trgm` — GIN trigram index, `%` operator + `similarity()` |
| Fusion | Reciprocal Rank Fusion (RRF k=60) computed in SQL CTE |
| Schema | Drizzle ORM (Neon) |
| Async ingestion | RabbitMQ worker (`search.ingest` queue) |
| Embedding | Gemini `gemini-embedding-001`, 768 dims, `RETRIEVAL_DOCUMENT` task type |
| Caching | Redis, 900s TTL, sha-256 keyed |
| HTTP | Fastify + Effect service — `/api/v1/search/*` |

---

## 4. Schema

### 4.1 `search_documents`

```sql
CREATE TABLE search_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  entity_type      VARCHAR(50) NOT NULL DEFAULT 'document',
  entity_id        VARCHAR(255),                        -- nullable FK to source entity
  title            VARCHAR(500) NOT NULL,
  content          TEXT NOT NULL,
  content_hash     VARCHAR(64) NOT NULL,                -- SHA-256 of normalized content
  doc_metadata     JSONB NOT NULL DEFAULT '{}',
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_search_documents_tenant_hash UNIQUE (tenant_id, content_hash)
);

CREATE INDEX idx_search_docs_tenant_type ON search_documents(tenant_id, entity_type);
CREATE INDEX idx_search_docs_entity      ON search_documents(tenant_id, entity_id)
  WHERE entity_id IS NOT NULL;
CREATE INDEX idx_search_docs_metadata    ON search_documents USING gin(doc_metadata);
```

### 4.2 `search_chunks`

```sql
CREATE TABLE search_chunks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  chunk_index    INT NOT NULL,
  content        TEXT NOT NULL,
  embedding      VECTOR(768),
  chunk_metadata JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_search_chunks_doc_idx UNIQUE (document_id, chunk_index)
);

-- Three search indexes
CREATE INDEX search_chunks_bm25_idx   ON search_chunks USING bm25(content)
  WITH (text_config = 'english');
CREATE INDEX search_chunks_vector_idx ON search_chunks USING diskann(embedding vector_cosine_ops);
CREATE INDEX search_chunks_trgm_idx   ON search_chunks USING gin(content gin_trgm_ops);

-- Scan support
CREATE INDEX idx_search_chunks_doc    ON search_chunks(document_id);
CREATE INDEX idx_search_chunks_meta   ON search_chunks USING gin(chunk_metadata);
```

> **Drizzle migration note:** Drizzle does not generate BM25 or DiskANN index syntax natively. These indexes are created via a raw SQL migration file alongside the Drizzle schema definition.

### 4.3 Ingestion job tracking

Job status lives in Redis: `search:job:<jobId>` → `{ status, chunkCount?, error? }` TTL 24h.
No separate `search_jobs` table needed (reduces DB load on hot write path).

---

## 5. Hybrid Search Query

Single SQL round-trip using CTEs. Runs three branches in parallel (Postgres planner parallelizes CTEs):

```sql
WITH
  bm25 AS (
    SELECT c.id AS chunk_id,
           ROW_NUMBER() OVER (
             ORDER BY c.content <@> to_bm25query(:query, 'search_chunks_bm25_idx') ASC
           ) AS rank
    FROM search_chunks c
    JOIN search_documents d ON d.id = c.document_id
    WHERE d.tenant_id = :tenantId
      AND (:entityType IS NULL OR d.entity_type = :entityType)
      AND (c.content <@> to_bm25query(:query, 'search_chunks_bm25_idx')) < 0
      AND (:metadataFilter IS NULL OR d.doc_metadata @> :metadataFilter::jsonb)
    ORDER BY c.content <@> to_bm25query(:query, 'search_chunks_bm25_idx') ASC
    LIMIT :candidateLimit
  ),
  vec AS (
    SELECT c.id AS chunk_id,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> :embedding::vector ASC) AS rank
    FROM search_chunks c
    JOIN search_documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      AND d.tenant_id = :tenantId
      AND (:entityType IS NULL OR d.entity_type = :entityType)
      AND (:metadataFilter IS NULL OR d.doc_metadata @> :metadataFilter::jsonb)
    ORDER BY c.embedding <=> :embedding::vector ASC
    LIMIT :candidateLimit
  ),
  trgm AS (
    SELECT c.id AS chunk_id,
           ROW_NUMBER() OVER (ORDER BY similarity(c.content, :query) DESC) AS rank
    FROM search_chunks c
    JOIN search_documents d ON d.id = c.document_id
    WHERE c.content % :query
      AND similarity(c.content, :query) >= 0.1
      AND d.tenant_id = :tenantId
      AND (:entityType IS NULL OR d.entity_type = :entityType)
    ORDER BY similarity(c.content, :query) DESC
    LIMIT :candidateLimit
  ),
  fused AS (
    SELECT
      COALESCE(b.chunk_id, v.chunk_id, t.chunk_id) AS chunk_id,
      COALESCE(1.0 / (60 + b.rank), 0.0) +
      COALESCE(1.0 / (60 + v.rank), 0.0) +
      COALESCE(1.0 / (60 + t.rank), 0.0) AS rrf_score
    FROM bm25 b
    FULL OUTER JOIN vec  v ON b.chunk_id = v.chunk_id
    FULL OUTER JOIN trgm t ON COALESCE(b.chunk_id, v.chunk_id) = t.chunk_id
  )
SELECT
  c.id::text      AS chunk_id,
  d.id::text      AS document_id,
  d.title,
  d.entity_type,
  d.entity_id,
  c.content,
  c.chunk_index,
  c.chunk_metadata,
  d.doc_metadata,
  f.rrf_score     AS score
FROM fused f
JOIN search_chunks c  ON c.id = f.chunk_id
JOIN search_documents d ON d.id = c.document_id
ORDER BY f.rrf_score DESC
LIMIT :limit;
```

**DiskANN tuning (run before vec CTE):**
```sql
SET LOCAL diskann.query_search_list_size = 100;
SET LOCAL diskann.query_rescore = 50;
```

---

## 6. Chunking

Word-boundary splitting (matches Python reference exactly):

```
chunk_size    = 512 tokens (words)
chunk_overlap = 64 tokens
step          = chunk_size - chunk_overlap = 448
```

Normalization: collapse all whitespace → single spaces, trim. Preserves word ordering for BM25.

---

## 7. Ingestion Pipeline

```
HTTP POST /api/v1/search/ingest
  │
  ├─ normalize content (whitespace collapse)
  ├─ SHA-256 content hash
  ├─ SELECT from search_documents WHERE tenant_id=:t AND content_hash=:h
  │    ├─ if found → return { duplicate: true, documentId: existing.id }
  │    └─ not found → INSERT search_documents (entity_type, entityId, title, content, hash, metadata)
  ├─ generate jobId (uuid)
  ├─ publish RabbitMQ "search.ingest" { jobId, documentId, content, tenantId }
  ├─ SET Redis search:job:<jobId> { status: 'queued' } TTL 24h
  └─ return { jobId, documentId, status: 'queued', duplicate: false }

Worker (SearchIngestWorker, health :9105, queue: search.ingest):
  ├─ chunk_text(content, size=512, overlap=64) → TextChunk[]
  ├─ batch Gemini aembed_documents (200/batch, RETRIEVAL_DOCUMENT, max 3 concurrent batches)
  ├─ upsert search_chunks ON CONFLICT (document_id, chunk_index) DO UPDATE
  ├─ if chunks > 10_000: ANALYZE search_chunks
  └─ SET Redis search:job:<jobId> { status: 'completed', chunkCount } TTL 24h
```

**Error handling in worker:**
- Embedding API failure → SET Redis job { status: 'failed', error } → nack (DLQ after 3 attempts)
- Partial batch failure → retry individual batches, nack full message only on unrecoverable error

---

## 8. API Surface

All routes under `/api/v1/search`. Auth via existing `@fastify/auth` PASETO preHandler.

| Method | Path | Request | Response |
|---|---|---|---|
| `POST` | `/ingest` | `SearchIngestRequest` | `SearchIngestResponse` |
| `GET` | `/ingest/:jobId` | — | `SearchJobStatusResponse` |
| `POST` | `/hybrid` | `HybridSearchRequest` | `SearchResponse` |
| `POST` | `/suggest` | `SuggestRequest` | `SuggestResponse` |
| `DELETE` | `/document/:documentId` | — | `{ deleted: true }` |
| `GET` | `/health` | — | `SearchHealthResponse` |

### Request/Response Schemas (Effect Schema)

```typescript
// POST /ingest
SearchIngestRequest = Schema.Struct({
  title:       Schema.String.check(Schema.isMinLength(1)),
  content:     Schema.String.check(Schema.isMinLength(1)),
  tenantId:    Schema.String,
  entityType:  Schema.optional(Schema.String),    // default 'document'
  entityId:    Schema.optional(Schema.String),
  sourceUri:   Schema.optional(Schema.String),
  docMetadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})

// POST /hybrid
HybridSearchRequest = Schema.Struct({
  query:          Schema.String.check(Schema.isMinLength(1)),
  tenantId:       Schema.String,
  entityType:     Schema.optional(Schema.String),
  limit:          Schema.optional(Schema.Int),       // default 20, max 100
  candidateLimit: Schema.optional(Schema.Int),       // default 50, max 200
  metadataFilter: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  bypassCache:    Schema.optional(Schema.Boolean),
})

// POST /suggest
SuggestRequest = Schema.Struct({
  query:      Schema.String.check(Schema.isMinLength(1)),
  tenantId:   Schema.String,
  entityType: Schema.optional(Schema.String),
  limit:      Schema.optional(Schema.Int),           // default 10, max 20
})
```

---

## 9. Redis Caching

```
Key:   search:<tenantId>:<sha256(query|entityType|limit|candidateLimit|metadataFilter)>
Value: JSON SearchResponse
TTL:   900s (15 min)
```

Cache is **append-only** — no invalidation on ingest (eventual consistency is fine for search).
`bypassCache: true` skips both read and write.

---

## 10. Entity Adapters (Phase 7 wiring)

```typescript
// src/app/features/search/entityAdapters.ts
export interface SearchEntityAdapter<T> {
  readonly entityType: string
  toSearchPayload(entity: T, tenantId: string): SearchIngestPayload
}

// Examples wired in Phase 7:
export class ProductSearchAdapter implements SearchEntityAdapter<Product> {
  entityType = 'product'
  toSearchPayload(p, tenantId) {
    return {
      title: p.name,
      content: `${p.name} ${p.description} ${p.tags.join(' ')}`,
      entityId: p.id,
      docMetadata: { brand: p.brand, category: p.category, price: p.price },
      tenantId,
    }
  }
}
```

---

## 11. File Structure

```
src/
  app/features/search2/               ← new module (rename to search/ after cleanup)
    searchRoutes.ts                   ← Fastify routes
    searchService.ts                  ← Effect SearchService
    searchRepository.ts               ← raw SQL (BM25, vector, trigram, upsert)
    searchChunking.ts                 ← chunk_text() helper
    searchDto.ts                      ← Effect Schema request/response types
    searchErrors.ts                   ← tagged errors
    entityAdapters.ts                 ← adapter interface + concrete impls
  db/schema/
    searchSchema.ts                   ← Drizzle table definitions
  db/migrations/
    XXXX_pg_search_extensions.sql     ← CREATE EXTENSION + BM25/DiskANN index SQL
  workers/
    searchIngestWorker.ts             ← RabbitMQ consumer, health :9105
```

Legacy `src/app/features/search/` (Elasticsearch) is **deleted** as part of this phase.

---

## 12. Extension Prerequisites

```sql
CREATE EXTENSION IF NOT EXISTS pg_textsearch;      -- BM25
CREATE EXTENSION IF NOT EXISTS vector;             -- pgvector
CREATE EXTENSION IF NOT EXISTS vectorscale;        -- pgvectorscale (DiskANN)
CREATE EXTENSION IF NOT EXISTS pg_trgm;            -- trigram
```

> **Neon:** All four extensions are available. `pg_textsearch` requires Tiger Cloud or self-hosted; for standard Neon, fall back to `tsvector` GIN + `ts_rank` until available. The service gracefully degrades: if pg_textsearch is unavailable, BM25 branch runs tsvector fallback.

---

## 13. Error Handling

| Error | Tag | HTTP |
|---|---|---|
| `SearchExtensionUnavailableError` | extension not installed | 503 |
| `SearchEmbeddingError` | Gemini embedding failed | 502 |
| `SearchDocumentNotFoundError` | DELETE on unknown documentId | 404 |
| `SearchQueryTooLongError` | query > 1000 chars | 400 |
| `SearchTenantRequiredError` | missing tenantId | 400 |

---

## 14. Performance Targets (Neon PostgreSQL)

| Metric | Target |
|---|---|
| Hybrid search p50 | < 50ms (cached) |
| Hybrid search p99 (cold) | < 300ms (1M chunks) |
| DiskANN recall@10 | > 95% |
| Ingestion (1MB doc) | < 3s end-to-end (async worker) |
| Trigram suggest p99 | < 20ms |

---

## 15. What's Removed

- `@elastic/elasticsearch` package
- `src/app/connections/connectElasticSearch.ts`
- `src/app/config/searchConfig.ts`
- `src/app/features/search/` (all 9 legacy files)
- `ELASTICSEARCH_HOST`, `ELASTICSEARCH_API_KEY` env vars
- ES pipeline management endpoints (not needed with Postgres-native indexing)

---

## 16. Implementation Order

1. **Drizzle schema** — `searchSchema.ts` + raw SQL migration for extensions + special indexes
2. **Chunking helper** — `searchChunking.ts` (pure, testable)
3. **Errors** — `searchErrors.ts`
4. **Repository** — `searchRepository.ts` (BM25, vector, trigram, hybrid CTE, upsert, fetch)
5. **SearchService** — `searchService.ts` (ingestDocument, hybridSearch, suggest, deleteDocument, getJobStatus)
6. **Routes** — `searchRoutes.ts`
7. **Worker** — `searchIngestWorker.ts` (chunk + embed + upsert)
8. **AppLayer wire** — add SearchServiceLive, register routes, add worker to startup docs
9. **Delete legacy** — remove ES files, packages, env refs
10. **Tests** — unit tests for chunking (pure), repository (mock SQL), service

---

## For the Chosen Ones

**RRF k=60 is not arbitrary.** The constant was derived empirically in the original RRF paper (Cormack et al. 2009) and validated across TREC benchmarks. It weights rank-1 results at `1/61 ≈ 0.016` and rank-60 at `1/120 ≈ 0.008`. The effect is a **soft top-60 cutoff** — anything outside the top 60 in any single signal contributes less than 0.3% to the fused score. This is why you set `candidateLimit = 50` per signal: you want all candidates to fall within the scoring-dense zone where rank differences matter.

**DiskANN vs HNSW at Flipkart scale:** DiskANN (Microsoft Research, 2019, production at Bing) stores the graph on disk with a memory-mapped index and uses beam search with rescore. At 100M vectors, HNSW requires ~100GB RAM (the entire graph must be in memory). DiskANN needs only ~20GB RAM for the same dataset because it reads from NVMe SSD. For Neon (cloud Postgres), this means you can search 100M embeddings with the same instance size that HNSW would need for 20M. The `query_search_list_size` (beam width) and `query_rescore` (exact distance re-ranking of top-K candidates) are the two tuning knobs — more = better recall, higher latency. Production sweet spot: `search_list_size=100, rescore=50`.

**The BM25 score sign.** `pg_textsearch` returns **negative** BM25 scores (lower = more relevant, consistent with cost semantics). When you see `ORDER BY score ASC` in the BM25 CTE — that's correct. When you materialize the score for display, negate it: `(-1 * raw_score) = relevance_score`. The Python reference does this explicitly; the TypeScript version should too, otherwise the frontend shows confusing negative numbers.

**Trigram threshold 0.1 is intentionally permissive.** `similarity() >= 0.1` means 10% of the input's trigrams match. This catches typos, partial brand names, and abbreviated queries. At this threshold, expect 3-10× more candidates from the trgm branch than from BM25. That's fine — RRF's rank-based fusion absorbs noisy trigram candidates gracefully because a trigram-only match will only appear in one signal set and get at most `1/61` RRF weight. The truly relevant results appear in all three sets and get `3 × 1/61 ≈ 0.049` — nearly 3× the weight of a trigram-only hit.
