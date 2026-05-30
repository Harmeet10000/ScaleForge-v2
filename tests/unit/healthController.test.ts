/**
 * tests/unit/healthController.test.ts
 *
 * DEPRECATED: This file tested the legacy Express health controller.
 * The Express controller has been replaced by the Effect-native healthService.ts.
 * See tests/unit/features/health.test.ts for the current test suite.
 */

import { describe, it, expect } from "bun:test"

describe("Health Controller - Unit Tests (legacy — superseded)", () => {
  it("timestamp generation produces valid ISO-8601 strings", () => {
    const ts = new Date().toISOString()
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(ts)).toBe(true)
  })
})
