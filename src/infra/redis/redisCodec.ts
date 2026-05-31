/**
 * src/infra/redis/redisCodec.ts
 *
 * Binary codec for Redis cache values using msgpackr.
 *
 * Why msgpackr over JSON:
 *   - ~30-50% smaller payloads on typical object arrays
 *   - Faster encode/decode than JSON on Node v24 for non-trivial payloads
 *   - No type-preservation needed — SearchResultRow / JobStatus carry no
 *     Date objects (all dates come from Postgres JSONB as ISO strings)
 *
 * Why not superjson:
 *   - superjson adds a metadata wrapper → larger payloads + slower than JSON
 *   - Type-preservation only matters for Date/Map/Set/BigInt round-trips;
 *     none of those appear in the cached types here
 *
 * Migration shim:
 *   Existing cache entries written as plain JSON strings are detected by
 *   inspecting the first byte. JSON always starts with one of:
 *     0x7B '{'  0x5B '['  0x22 '"'  0x30-0x39 digit  0x6E 'n' (null)
 *   msgpackr encodes objects as fixmap (0x80-0x8F) or map16/32 (0xDE/0xDF),
 *   arrays as fixarray (0x90-0x9F) or array16/32 (0xDC/0xDD) — none overlap
 *   with the JSON first-byte range. So a single byte check is sufficient.
 *
 * Pair with RedisService.setBuffer / RedisService.getBuffer.
 */

import { pack, unpack } from "msgpackr"

// ── Encode ────────────────────────────────────────────────────────────────────

/** Encode any serializable value to a msgpackr Buffer for Redis storage. */
export const encodeRedis = (value: unknown): Buffer => pack(value) as Buffer

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Decode a Buffer returned by Redis.getBuffer().
 *
 * Migration shim: if the first byte looks like the start of a JSON string
 * (was stored by the old JSON.stringify path), fall back to JSON.parse.
 * This handles the transition window without requiring a cache flush.
 * Once all keys have expired and been rewritten by the new path, the JSON
 * branch will never be reached.
 */
export const decodeRedis = <T>(data: Buffer): T => {
  const firstByte = data[0]
  if (
    firstByte === 0x7b || // '{'
    firstByte === 0x5b || // '['
    firstByte === 0x22 || // '"'
    firstByte === 0x6e || // 'n' (null)
    (firstByte !== undefined && firstByte >= 0x30 && firstByte <= 0x39) // '0'-'9'
  ) {
    return JSON.parse(data.toString("utf-8")) as T
  }
  return unpack(data) as T
}
