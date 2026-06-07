/**
 * src/app/features/search/searchChunking.ts
 *
 * Pure text chunking with word-boundary overlap.
 *
 * Strategy: split on whitespace → sliding window of `size` words,
 * stepping `size - overlap` words forward each iteration.
 * This matches the Python reference implementation exactly.
 *
 * Defaults:
 *   chunk_size    = 512 words
 *   chunk_overlap = 64 words
 *   step          = 448 words
 *
 * These are tuned for gemini-embedding-001 which supports up to 2048 tokens.
 * 512 words ≈ 680 tokens — well within limit, leaves room for long words.
 */

export interface TextChunk {
  /** Zero-based index within the parent document */
  readonly index: number
  /** Chunk text (whitespace normalised) */
  readonly text: string
  /** Approximate word count */
  readonly wordCount: number
}

export interface ChunkOptions {
  readonly size?: number
  readonly overlap?: number
}

/**
 * Normalise text: collapse all whitespace runs to a single space, trim.
 */
export const normalizeText = (text: string): string =>
  text.replace(/\s+/g, " ").trim()

/**
 * Split normalised text into overlapping word chunks.
 * Returns an empty array for empty/whitespace-only input.
 */
export const chunkText = (text: string, opts: ChunkOptions = {}): TextChunk[] => {
  const size = opts.size ?? 512
  const overlap = opts.overlap ?? 64

  if (overlap >= size) {
    throw new RangeError(`chunk overlap (${overlap}) must be less than chunk size (${size})`)
  }

  const normalised = normalizeText(text)
  if (normalised.length === 0) return []

  const words = normalised.split(" ")
  if (words.length === 0) return []

  const step = size - overlap
  const chunks: TextChunk[] = []
  let i = 0

  while (i < words.length) {
    const slice = words.slice(i, i + size)
    const chunkText = slice.join(" ")
    chunks.push({
      index: chunks.length,
      text: chunkText,
      wordCount: slice.length,
    })
    if (i + size >= words.length) break
    i += step
  }

  return chunks
}

/**
 * Compute SHA-256 hex digest of a normalised string.
 * Used for content deduplication in search_documents.
 */
export const sha256Hex = async (text: string): Promise<string> => {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
