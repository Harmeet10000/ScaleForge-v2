/**
 * src/db/schema/searchSchema.ts
 *
 * Two-table schema for PostgreSQL hybrid search.
 *
 * search_documents  — one row per source entity (product, user, post, document)
 * search_chunks     — one-to-many child rows; each chunk holds text + embedding
 *
 * Special indexes (BM25, DiskANN, trigram) are created in the raw SQL migration:
 *   src/db/migrations/0003_pg_search_extensions.sql
 * because Drizzle does not generate those index types natively.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { vector } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

// ── search_documents ──────────────────────────────────────────────────────────

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Hard tenant filter applied on every query — never omit */
    tenantId: uuid("tenant_id").notNull(),

    /**
     * Source entity category.
     * Examples: 'product', 'user', 'post', 'document', 'faq'
     */
    entityType: varchar("entity_type", { length: 50 }).notNull().default("document"),

    /** Optional FK to the source row (not enforced at DB level for schema flexibility) */
    entityId: varchar("entity_id", { length: 255 }),

    /** Short displayable title — returned in search results */
    title: varchar("title", { length: 500 }).notNull(),

    /** Full source text — chunked + embedded by the ingest worker */
    content: text("content").notNull(),

    /**
     * SHA-256 of normalised content.
     * UNIQUE per (tenant_id, content_hash) — deduplication gate.
     */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),

    /** Flexible attributes: brand, category, price, author, tags, etc. */
    docMetadata: jsonb("doc_metadata").$type<Record<string, unknown>>().notNull().default({}),

    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantTypeIdx: index("idx_search_docs_tenant_type").on(t.tenantId, t.entityType),
    entityIdx: index("idx_search_docs_entity").on(t.tenantId, t.entityId),
    metaIdx: index("idx_search_docs_metadata").using("gin", t.docMetadata),
    tenantHashUniq: uniqueIndex("uq_search_documents_tenant_hash").on(t.tenantId, t.contentHash),
  })
)

// ── search_chunks ─────────────────────────────────────────────────────────────

export const searchChunks = pgTable(
  "search_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => searchDocuments.id, { onDelete: "cascade" }),

    /** Zero-based ordering index within the parent document */
    chunkIndex: integer("chunk_index").notNull(),

    /** Chunk text — indexed by BM25 + trigram */
    content: text("content").notNull(),

    /**
     * Dense embedding vector (768 dims, gemini-embedding-001).
     * NULL until the ingest worker populates it.
     * Indexed by DiskANN for approximate nearest-neighbour search.
     */
    embedding: vector("embedding", { dimensions: 768 }),

    /** { token_count, ... } */
    chunkMetadata: jsonb("chunk_metadata").$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    docIdx: index("idx_search_chunks_doc").on(t.documentId),
    docChunkUniq: uniqueIndex("uq_search_chunks_doc_idx").on(t.documentId, t.chunkIndex),
    metaIdx: index("idx_search_chunks_meta").using("gin", t.chunkMetadata),
    // Note: BM25, DiskANN, and trigram indexes are created in the raw SQL migration
    // because Drizzle does not generate those index types.
  })
)

// ── Relations ─────────────────────────────────────────────────────────────────

export const searchDocumentsRelations = relations(searchDocuments, ({ many }) => ({
  chunks: many(searchChunks),
}))

export const searchChunksRelations = relations(searchChunks, ({ one }) => ({
  document: one(searchDocuments, {
    fields: [searchChunks.documentId],
    references: [searchDocuments.id],
  }),
}))
