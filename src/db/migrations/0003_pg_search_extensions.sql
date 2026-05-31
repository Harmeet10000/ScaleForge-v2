-- src/db/migrations/0003_pg_search_extensions.sql
--
-- PostgreSQL hybrid search: extensions + special indexes.
-- Run AFTER Drizzle creates the base tables (search_documents, search_chunks).
--
-- Extensions required:
--   pg_textsearch  — BM25 scoring via <@> operator
--   vector         — pgvector base (dense vectors)
--   vectorscale    — pgvectorscale: DiskANN index for 100M-scale ANN
--   pg_trgm        — trigram similarity for fuzzy/partial matching
--
-- NOTE: On standard Neon, pg_textsearch may not be available.
-- The BM25 branch in searchRepository.ts has a graceful tsvector fallback.

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;

--> statement-breakpoint
-- pg_textsearch is Tiger-Cloud / self-hosted only; skip if unavailable
-- CREATE EXTENSION IF NOT EXISTS pg_textsearch;

--> statement-breakpoint
-- BM25 full-text index on chunk content (requires pg_textsearch)
-- CREATE INDEX search_chunks_bm25_idx ON search_chunks
--   USING bm25(content) WITH (text_config = 'english');

--> statement-breakpoint
-- DiskANN approximate nearest-neighbour index (requires vectorscale)
-- Created AFTER embeddings are populated (not at migration time).
-- Run manually or via a post-ingest hook once the first batch is ready:
--
-- CREATE INDEX search_chunks_vector_idx ON search_chunks
--   USING diskann(embedding vector_cosine_ops);
--
-- Until then, pgvector HNSW is used as fallback:
CREATE INDEX IF NOT EXISTS search_chunks_hnsw_idx ON search_chunks
  USING hnsw(embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

--> statement-breakpoint
-- Trigram GIN index on chunk content
CREATE INDEX IF NOT EXISTS search_chunks_trgm_idx ON search_chunks
  USING gin(content gin_trgm_ops);

--> statement-breakpoint
-- Trigram GIN index on document titles (for suggest endpoint)
CREATE INDEX IF NOT EXISTS search_docs_title_trgm_idx ON search_documents
  USING gin(title gin_trgm_ops);

--> statement-breakpoint
-- tsvector GIN index — used as BM25 fallback when pg_textsearch unavailable
CREATE INDEX IF NOT EXISTS search_chunks_fts_idx ON search_chunks
  USING gin(to_tsvector('english', content));
