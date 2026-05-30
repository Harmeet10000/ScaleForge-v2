/**
 * tests/unit/workers/workerHealth.test.ts
 *
 * Unit tests for the workerHealth HTTP server.
 * No external dependencies — pure in-process HTTP.
 */

import { describe, it, expect, afterEach } from "bun:test"
import { makeWorkerHealth } from "../../../src/workers/shared/workerHealth.ts"

let handle: ReturnType<typeof makeWorkerHealth> | null = null

afterEach(async () => {
  if (handle) {
    await handle.stop()
    handle = null
  }
})

const fetchFromPort = async (port: number, path: string) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, body: await res.json() as Record<string, string> }
}

describe("WorkerHealth", () => {
  it("GET /health returns 200 immediately", async () => {
    handle = makeWorkerHealth({ port: 19100 })
    await handle.start()

    const { status, body } = await fetchFromPort(19100, "/health")
    expect(status).toBe(200)
    expect(body["status"]).toBe("ok")
  })

  it("GET /ready returns 503 before setReady(true)", async () => {
    handle = makeWorkerHealth({ port: 19101 })
    await handle.start()

    const { status, body } = await fetchFromPort(19101, "/ready")
    expect(status).toBe(503)
    expect(body["status"]).toBe("not_ready")
  })

  it("GET /ready returns 200 after setReady(true)", async () => {
    handle = makeWorkerHealth({ port: 19102 })
    await handle.start()
    handle.setReady(true)

    const { status, body } = await fetchFromPort(19102, "/ready")
    expect(status).toBe(200)
    expect(body["status"]).toBe("ready")
  })

  it("GET /ready returns 503 after setReady(false) toggles back", async () => {
    handle = makeWorkerHealth({ port: 19103 })
    await handle.start()
    handle.setReady(true)
    handle.setReady(false)

    const { status } = await fetchFromPort(19103, "/ready")
    expect(status).toBe(503)
  })

  it("GET /metrics returns 200 when metricsCallback provided", async () => {
    handle = makeWorkerHealth({
      port: 19104,
      metricsCallback: async () => "# HELP test\ntest_metric 1\n",
    })
    await handle.start()

    const res = await fetch("http://127.0.0.1:19104/metrics")
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("test_metric")
  })

  it("GET /unknown returns 404", async () => {
    handle = makeWorkerHealth({ port: 19105 })
    await handle.start()

    const res = await fetch("http://127.0.0.1:19105/unknown")
    expect(res.status).toBe(404)
  })
})
