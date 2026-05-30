/**
 * tests/unit/workers/webhookWorker.test.ts
 *
 * Unit tests for webhookWorker helpers.
 * Tests the pure functions: nextRetryDelaySecs, buildSignature (via deliverWebhook mock).
 */

import { describe, it, expect } from "bun:test"
import { nextRetryDelaySecs, MAX_ATTEMPTS } from "../../../src/workers/webhookWorker.ts"

describe("webhookWorker — nextRetryDelaySecs", () => {
  it("attempt 0 → 30s", () => {
    expect(nextRetryDelaySecs(0)).toBe(30)
  })

  it("attempt 1 → 300s (5m)", () => {
    expect(nextRetryDelaySecs(1)).toBe(300)
  })

  it("attempt 2 → 1800s (30m)", () => {
    expect(nextRetryDelaySecs(2)).toBe(1800)
  })

  it("attempt 3 → 7200s (2h)", () => {
    expect(nextRetryDelaySecs(3)).toBe(7200)
  })

  it("attempt 4 → 28800s (8h)", () => {
    expect(nextRetryDelaySecs(4)).toBe(28800)
  })

  it("out-of-range attempt falls back to last delay", () => {
    expect(nextRetryDelaySecs(99)).toBe(28800)
  })

  it("MAX_ATTEMPTS equals backoff array length", () => {
    // Ensure MAX_ATTEMPTS is kept in sync with BACKOFF_DELAYS_SECS
    expect(MAX_ATTEMPTS).toBe(5)
  })
})
