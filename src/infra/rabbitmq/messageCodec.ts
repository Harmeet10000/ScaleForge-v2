/**
 * src/infra/rabbitmq/messageCodec.ts
 *
 * Binary message encoding/decoding for RabbitMQ worker messages using msgpackr.
 *
 * Why msgpackr over JSON:
 *   - ~4× smaller payload (binary vs text)
 *   - ~10× faster encode/decode (zero-copy struct packing)
 *   - Native support for Buffer, Date, BigInt — no custom replacers needed
 *   - Critical at high worker throughput (1k+ msgs/sec)
 *
 * Usage:
 *   // Producer (RabbitMQ publish):
 *   channel.publish(exchange, key, encode(job))
 *
 *   // Consumer (worker):
 *   const job = decode<WebhookJob>(msg.content)
 */

import { pack, unpack, Packr } from "msgpackr"
import { Data } from "effect"

// ── Errors ───────────────────────────────────────────────────────────────────

export class MessageEncodeError extends Data.TaggedError("MessageEncodeError")<{
  readonly cause: unknown
}> {}

export class MessageDecodeError extends Data.TaggedError("MessageDecodeError")<{
  readonly cause: unknown
}> {}

// ── Codec instance ────────────────────────────────────────────────────────────
// useRecords: false — encodes objects as maps (compatible with any consumer)
// bundleStrings: true — de-duplicates repeated string keys (~20% space saving on arrays of records)
const packr = new Packr({ useRecords: false, bundleStrings: true })

// ── Encode ────────────────────────────────────────────────────────────────────

/**
 * Encode a job to a msgpack Buffer ready for AMQP publish.
 * Throws MessageEncodeError if the value cannot be serialized.
 */
export const encode = <T>(data: T): Buffer => {
  try {
    return packr.pack(data) as Buffer
  } catch (cause) {
    throw new MessageEncodeError({ cause })
  }
}

/**
 * Safe JSON fallback encoder — use only in tests or when msgpack is unavailable.
 */
export const encodeJson = <T>(data: T): Buffer =>
  Buffer.from(JSON.stringify(data), "utf-8")

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Decode a msgpack Buffer received from AMQP.
 * Returns the decoded value typed as T (caller is responsible for validation).
 * Throws MessageDecodeError if the buffer is malformed.
 *
 * Always validate the result through Effect Schema after decoding:
 *   const job = decode<unknown>(msg.content)
 *   const result = Schema.decodeUnknownResult(JobSchema)(job)
 */
export const decode = <T>(buffer: Buffer): T => {
  try {
    return unpack(buffer) as T
  } catch (cause) {
    throw new MessageDecodeError({ cause })
  }
}

/**
 * Safe JSON fallback decoder — matches encodeJson above.
 */
export const decodeJson = <T>(buffer: Buffer): T =>
  JSON.parse(buffer.toString("utf-8")) as T

// ── Detect format ─────────────────────────────────────────────────────────────
// During migration, some producers still use JSON. Detect format from first byte:
// msgpack maps start with 0x80-0x8f (fixmap) or 0xde/0xdf (map16/32).
// JSON always starts with 0x7b '{'.

export const isMsgpack = (buffer: Buffer): boolean =>
  buffer.length > 0 && buffer[0] !== 0x7b  // not '{'

/**
 * Auto-detect and decode either msgpack or JSON.
 * Use during the JSON→msgpack migration window in workers.
 */
export const decodeAuto = <T>(buffer: Buffer): T =>
  isMsgpack(buffer) ? decode<T>(buffer) : decodeJson<T>(buffer)

// Re-export raw pack/unpack for one-off use
export { pack, unpack }
