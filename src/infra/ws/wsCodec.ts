/**
 * src/infra/ws/wsCodec.ts
 *
 * WebSocket message codec using superjson.
 *
 * Why superjson over JSON.stringify/parse:
 *   - Preserves Date (as ISO string + metadata), BigInt, Map, Set, undefined
 *   - Zero extra deps — superjson handles its own serialization
 *   - Critical for leaderboard WS messages which carry Date timestamps and
 *     BigInt scores without client-side deserialization bugs
 *
 * Usage (server → client push):
 *   ws.send(WsCodec.encode({ type: 'snapshot', data: { scores, updatedAt: new Date() } }))
 *
 * Usage (client → server, e.g. subscribe message):
 *   const msg = WsCodec.decode<ClientMessage>(rawString)
 */

import superjson from "superjson"
import { Data } from "effect"

// ── Errors ───────────────────────────────────────────────────────────────────

export class WsEncodeError extends Data.TaggedError("WsEncodeError")<{
  readonly cause: unknown
}> {}

export class WsDecodeError extends Data.TaggedError("WsDecodeError")<{
  readonly cause: unknown
}> {}

// ── Codec ─────────────────────────────────────────────────────────────────────

/**
 * Encode any value to a JSON string with superjson type metadata.
 * The resulting string is safe to send over WebSocket text frames.
 */
export const encode = (data: unknown): string => {
  try {
    return superjson.stringify(data)
  } catch (cause) {
    throw new WsEncodeError({ cause })
  }
}

/**
 * Decode a superjson string back to the original typed value.
 * The caller is responsible for validating the shape (e.g. via Effect Schema).
 */
export const decode = <T>(raw: string): T => {
  try {
    return superjson.parse<T>(raw)
  } catch (cause) {
    throw new WsDecodeError({ cause })
  }
}

/**
 * Safe decode — returns null instead of throwing on malformed input.
 * Use in WS message handlers where you want to drop invalid messages gracefully.
 */
export const safeDecode = <T>(raw: string): T | null => {
  try {
    return superjson.parse<T>(raw)
  } catch {
    return null
  }
}

// ── Standard WS message envelope ─────────────────────────────────────────────
// All messages share this envelope. The `type` field drives routing.
// The `data` field carries the payload (superjson-encoded).

export interface WsMessage<T = unknown> {
  readonly type: string
  readonly data: T
  readonly ts?: string // ISO timestamp, set by server on outbound push
}

export const makeMessage = <T>(type: string, data: T): WsMessage<T> => ({
  type,
  data,
  ts: new Date().toISOString(),
})

export const encodeMessage = <T>(type: string, data: T): string =>
  encode(makeMessage(type, data))
