/**
 * src/app/features/search2/searchRepository.ts
 *
 * Raw SQL layer for the hybrid search engine.
 *
 * All queries use Drizzle's `sql` tagged template for parameter binding
 * (prevents SQL injection; params are sent as $1, $2, ... by Neon).
 *
 * Three search signals fused with RRF (k=60):
 *   - BM25 full-text via tsvector fallback (pg_textsearch is optional)
 *   - Dense vector cosine similarity via HNSW/DiskANN
 *   - Trigram similarity via pg_trgm
 *
 * If a signal's index is unavailable (e.g., no embeddings yet) it
 * simply contributes 0 RRF weight — the other signals carry the result.
 */

import { sql } from "drizzle-orm"
import { type NeonHttpDatabase } from "drizzle-orm/neon-http"
import { eq, and } from "drizzle-orm"
import { searchDocuments } from "../../../db/schema/searchSchema.ts"

// ── Result types ──────────────────────────────────────────────────────────────

export interface SearchResultRow {
  readonly chunkId: string
  readonly documentId: string
  readonly title: string
  readonly entityType: string
  readonly entityId: string | null
  readonly content: string
  readonly chunkIndex: number
  readonly chunkMetadata: Record<string, unknown>
  readonly docMetadata: Record<string, unknown>
  readonly score: number
}

export interface SuggestResultRow {
  readonly documentId: string
  readonly title: string
  readonly entityType: string
  readonly entityId: string | null
  readonly similarity: number
}

export interface UpsertChunkInput {
  readonly documentId: string
  readonly chunkIndex: number
  readonly content: string
  readonly embedding: number[] | null
  readonly chunkMetadata: Record<string, unknown>
}

// ── Health check ──────────────────────────────────────────────────────────────

export const checkExtensions = async (db: NeonHttpDatabase): Promise<{
  pgTrgm: boolean
  pgvector: boolean
  pgTextsearch: boolean
}> => {
  const result = await db.execute(sql<{ extname: string }>`
    SELECT extname FROM pg_extension
    WHERE extname IN ('pg_trgm', 'vector', 'pg_textsearch')
  `)
  const installed = new Set((result.rows as Array<{ extname: string }>).map((r) => r.extname))
  return {
    pgTrgm: installed.has("pg_trgm"),
    pgvector: installed.has("vector"),
    pgTextsearch: installed.has("pg_textsearch"),
  }
}

// ── Hybrid search CTE ─────────────────────────────────────────────────────────

export interface HybridSearchParams {
  readonly query: string
  readonly embedding: number[] | null
  readonly tenantId: string
  readonly entityType: string | null
  readonly limit: number
  readonly candidateLimit: number
  readonly metadataFilter: Record<string, unknown> | null
}

/**
 * Three-signal hybrid search (BM25 fallback + vector + trigram) fused with RRF.
 *
 * BM25 branch: uses tsvector GIN index (ts_rank_cd) as fallback since
 * pg_textsearch is not available on standard Neon. Scores are negated so
 * higher rank = better (consistent with RRF ascending-rank convention).
 *
 * Vector branch: skipped when embedding is null (no vectors populated yet).
 * Trigram branch: requires pg_trgm (always available after migration).
 */
export const hybridSearch = async (
  db: NeonHttpDatabase,
  params: HybridSearchParams,
): Promise<SearchResultRow[]> => {
  const {
    query,
    embedding,
    tenantId,
    entityType,
    limit,
    candidateLimit,
    metadataFilter,
  } = params

  const metaJson = metadataFilter !== null ? JSON.stringify(metadataFilter) : null

  // When no embedding is available, skip the vector CTE entirely.
  // We still run BM25 + trigram.
  if (embedding === null) {
    const result = await db.execute(sql<SearchResultRow>`
      WITH
      bm25 AS (
        SELECT
          c.id AS chunk_id,
          ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', ${query})) DESC
          ) AS rank
        FROM search_chunks c
        JOIN search_documents d ON d.id = c.document_id
        WHERE d.tenant_id = ${tenantId}::uuid
          AND to_tsvector('english', c.content) @@ plainto_tsquery('english', ${query})
          AND (${entityType}::text IS NULL OR d.entity_type = ${entityType})
          AND (${metaJson}::jsonb IS NULL OR d.doc_metadata @> ${metaJson}::jsonb)
        ORDER BY ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', ${query})) DESC
        LIMIT ${candidateLimit}
      ),
      trgm AS (
        SELECT
          c.id AS chunk_id,
          ROW_NUMBER() OVER (ORDER BY similarity(c.content, ${query}) DESC) AS rank
        FROM search_chunks c
        JOIN search_documents d ON d.id = c.document_id
        WHERE c.content % ${query}
          AND similarity(c.content, ${query}) >= 0.1
          AND d.tenant_id = ${tenantId}::uuid
          AND (${entityType}::text IS NULL OR d.entity_type = ${entityType})
        ORDER BY similarity(c.content, ${query}) DESC
        LIMIT ${candidateLimit}
      ),
      fused AS (
        SELECT
          COALESCE(b.chunk_id, t.chunk_id) AS chunk_id,
          COALESCE(1.0 / (60 + b.rank), 0.0) +
          COALESCE(1.0 / (60 + t.rank), 0.0) AS rrf_score
        FROM bm25 b
        FULL OUTER JOIN trgm t ON b.chunk_id = t.chunk_id
      )
      SELECT
        c.id::text          AS "chunkId",
        d.id::text          AS "documentId",
        d.title,
        d.entity_type       AS "entityType",
        d.entity_id         AS "entityId",
        c.content,
        c.chunk_index       AS "chunkIndex",
        c.chunk_metadata    AS "chunkMetadata",
        d.doc_metadata      AS "docMetadata",
        f.rrf_score         AS score
      FROM fused f
      JOIN search_chunks c  ON c.id = f.chunk_id
      JOIN search_documents d ON d.id = c.document_id
      ORDER BY f.rrf_score DESC
      LIMIT ${limit}
    `)
    return result.rows as unknown as SearchResultRow[]
  }

  // Full three-signal path (BM25 + vector + trigram)
  const embeddingStr = `[${embedding.join(",")}]`

  const result = await db.execute(sql<SearchResultRow>`
    WITH
    bm25 AS (
      SELECT
        c.id AS chunk_id,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', ${query})) DESC
        ) AS rank
      FROM search_chunks c
      JOIN search_documents d ON d.id = c.document_id
      WHERE d.tenant_id = ${tenantId}::uuid
        AND to_tsvector('english', c.content) @@ plainto_tsquery('english', ${query})
        AND (${entityType}::text IS NULL OR d.entity_type = ${entityType})
        AND (${metaJson}::jsonb IS NULL OR d.doc_metadata @> ${metaJson}::jsonb)
      ORDER BY ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', ${query})) DESC
      LIMIT ${candidateLimit}
    ),
    vec AS (
      SELECT
        c.id AS chunk_id,
        ROW_NUMBER() OVER (ORDER BY c.embedding <=> ${embeddingStr}::vector ASC) AS rank
      FROM search_chunks c
      JOIN search_documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL
        AND d.tenant_id = ${tenantId}::uuid
        AND (${entityType}::text IS NULL OR d.entity_type = ${entityType})
        AND (${metaJson}::jsonb IS NULL OR d.doc_metadata @> ${metaJson}::jsonb)
      ORDER BY c.embedding <=> ${embeddingStr}::vector ASC
      LIMIT ${candidateLimit}
    ),
    trgm AS (
      SELECT
        c.id AS chunk_id,
        ROW_NUMBER() OVER (ORDER BY similarity(c.content, ${query}) DESC) AS rank
      FROM search_chunks c
      JOIN search_documents d ON d.id = c.document_id
      WHERE c.content % ${query}
        AND similarity(c.content, ${query}) >= 0.1
        AND d.tenant_id = ${tenantId}::uuid
        AND (${entityType}::text IS NULL OR d.entity_type = ${entityType})
      ORDER BY similarity(c.content, ${query}) DESC
      LIMIT ${candidateLimit}
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
      c.id::text          AS "chunkId",
      d.id::text          AS "documentId",
      d.title,
      d.entity_type       AS "entityType",
      d.entity_id         AS "entityId",
      c.content,
      c.chunk_index       AS "chunkIndex",
      c.chunk_metadata    AS "chunkMetadata",
      d.doc_metadata      AS "docMetadata",
      f.rrf_score         AS score
    FROM fused f
    JOIN search_chunks c  ON c.id = f.chunk_id
    JOIN search_documents d ON d.id = c.document_id
    ORDER BY f.rrf_score DESC
    LIMIT ${limit}
  `)
  return result.rows as unknown as SearchResultRow[]
}

// ── Suggest (trigram title autocomplete) ─────────────────────────────────────

export const suggestDocuments = async (
  db: NeonHttpDatabase,
  params: {
    query: string
    tenantId: string
    entityType: string | null
    limit: number
  },
): Promise<SuggestResultRow[]> => {
  const { query, tenantId, entityType, limit } = params
  const result = await db.execute(sql<SuggestResultRow>`
    SELECT
      d.id::text              AS "documentId",
      d.title,
      d.entity_type           AS "entityType",
      d.entity_id             AS "entityId",
      similarity(d.title, ${query}) AS similarity
    FROM search_documents d
    WHERE d.tenant_id = ${tenantId}::uuid
      AND d.title % ${query}
      AND similarity(d.title, ${query}) >= 0.15
      AND (${entityType}::text IS NULL OR d.entity_type = ${entityType})
    ORDER BY similarity(d.title, ${query}) DESC
    LIMIT ${limit}
  `)
  return result.rows as unknown as SuggestResultRow[]
}

// ── Insert document ───────────────────────────────────────────────────────────

export interface InsertDocumentInput {
  readonly tenantId: string
  readonly entityType: string
  readonly entityId: string | null
  readonly title: string
  readonly content: string
  readonly contentHash: string
  readonly docMetadata: Record<string, unknown>
}

export const findDocumentByHash = async (
  db: NeonHttpDatabase,
  tenantId: string,
  contentHash: string,
): Promise<{ id: string } | null> => {
  const rows = await db
    .select({ id: searchDocuments.id })
    .from(searchDocuments)
    .where(
      and(
        eq(searchDocuments.tenantId, tenantId),
        eq(searchDocuments.contentHash, contentHash),
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export const insertDocument = async (
  db: NeonHttpDatabase,
  input: InsertDocumentInput,
): Promise<string> => {
  const rows = await db
    .insert(searchDocuments)
    .values({
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      content: input.content,
      contentHash: input.contentHash,
      docMetadata: input.docMetadata,
    })
    .returning({ id: searchDocuments.id })
  return rows[0]!.id
}

// ── Upsert chunks ─────────────────────────────────────────────────────────────

/**
 * Upsert a batch of chunks for a document.
 * ON CONFLICT (document_id, chunk_index) → update content + embedding + metadata.
 *
 * Uses raw SQL because Drizzle's onConflictDoUpdate can't handle
 * the vector type cleanly in the SET clause.
 */
export const upsertChunks = async (
  db: NeonHttpDatabase,
  chunks: UpsertChunkInput[],
): Promise<void> => {
  if (chunks.length === 0) return

  for (const chunk of chunks) {
    const embeddingStr = chunk.embedding !== null
      ? `[${chunk.embedding.join(",")}]`
      : null

    await db.execute(sql`
      INSERT INTO search_chunks (document_id, chunk_index, content, embedding, chunk_metadata)
      VALUES (
        ${chunk.documentId}::uuid,
        ${chunk.chunkIndex},
        ${chunk.content},
        ${embeddingStr}::vector,
        ${JSON.stringify(chunk.chunkMetadata)}::jsonb
      )
      ON CONFLICT (document_id, chunk_index) DO UPDATE SET
        content        = EXCLUDED.content,
        embedding      = EXCLUDED.embedding,
        chunk_metadata = EXCLUDED.chunk_metadata,
        updated_at     = now()
    `)
  }
}

// ── Delete document ───────────────────────────────────────────────────────────

export const deleteDocument = async (
  db: NeonHttpDatabase,
  documentId: string,
  tenantId: string,
): Promise<boolean> => {
  const rows = await db
    .delete(searchDocuments)
    .where(
      and(
        eq(searchDocuments.id, documentId),
        eq(searchDocuments.tenantId, tenantId),
      )
    )
    .returning({ id: searchDocuments.id })
  return rows.length > 0
}

// ── Analyze (planner stats) ───────────────────────────────────────────────────

/**
 * Run ANALYZE on search_chunks when chunk count crosses 10k.
 * Updates query planner statistics for better index selection.
 */
export const analyzeChunks = async (db: NeonHttpDatabase): Promise<void> => {
  await db.execute(sql`ANALYZE search_chunks`)
}

export const countChunksForDocument = async (
  db: NeonHttpDatabase,
  documentId: string,
): Promise<number> => {
  const result = await db.execute(sql<{ cnt: string }>`
    SELECT COUNT(*)::text AS cnt FROM search_chunks WHERE document_id = ${documentId}::uuid
  `)
  const row = (result.rows as Array<{ cnt: string }>)[0]
  return row ? parseInt(row.cnt, 10) : 0
}
