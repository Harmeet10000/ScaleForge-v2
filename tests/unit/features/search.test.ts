import { describe, it, expect } from "bun:test"

// Test the sortKeys helper inline (mirrors the implementation)
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)])
    )
  }
  return value
}

describe("sortKeys (cache fingerprint determinism)", () => {
  it("produces same JSON output regardless of key insertion order", () => {
    const a = JSON.stringify(sortKeys({ z: 1, a: 2, m: 3 }))
    const b = JSON.stringify(sortKeys({ m: 3, z: 1, a: 2 }))
    expect(a).toBe(b)
  })

  it("sorts nested object keys recursively", () => {
    const result = JSON.stringify(sortKeys({ b: { d: 4, c: 3 }, a: 1 }))
    expect(result).toBe('{"a":1,"b":{"c":3,"d":4}}')
  })

  it("preserves array element order (no sort on arrays)", () => {
    expect(JSON.stringify(sortKeys([3, 1, 2]))).toBe("[3,1,2]")
  })

  it("handles null and primitive pass-through", () => {
    expect(sortKeys(null)).toBe(null)
    expect(sortKeys(42)).toBe(42)
    expect(sortKeys("hello")).toBe("hello")
  })
})
