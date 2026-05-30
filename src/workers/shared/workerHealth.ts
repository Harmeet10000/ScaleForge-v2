/**
 * src/workers/shared/workerHealth.ts
 *
 * Minimal HTTP health server for Kubernetes/ECS liveness + readiness probes.
 * Zero Fastify overhead — raw Node.js `http.createServer`.
 *
 * Endpoints:
 *   GET /health  → 200 {"status":"ok"}   (liveness — process is running)
 *   GET /ready   → 200 {"status":"ready"} or 503 (readiness — queue connected)
 *   GET /metrics → 200 Prometheus text   (optional Prometheus scrape target)
 *
 * Usage:
 *   const health = WorkerHealth.make({ port: 9100 })
 *   health.setReady(true)         // call after consumer queue is established
 *   const server = health.start() // returns the http.Server for graceful shutdown
 */

import { createServer, type Server } from "node:http"

export interface WorkerHealthOptions {
  readonly port?: number
  /** Optional Prometheus metrics callback (e.g. `() => registry.metrics()`) */
  readonly metricsCallback?: () => Promise<string>
}

export interface WorkerHealthHandle {
  /** Signal that the worker's consumer queue is connected and ready. */
  readonly setReady: (ready: boolean) => void
  /** Start listening. Resolves once the server is bound. */
  readonly start: () => Promise<Server>
  /** Gracefully close the server. */
  readonly stop: () => Promise<void>
}

export const makeWorkerHealth = (opts: WorkerHealthOptions = {}): WorkerHealthHandle => {
  const port = opts.port ?? 9100
  let isReady = false
  let server: Server | null = null

  const handle: WorkerHealthHandle = {
    setReady: (ready) => {
      isReady = ready
    },

    start: () =>
      new Promise((resolve, reject) => {
        server = createServer((req, res) => {
          const url = req.url ?? "/"

          if (url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ status: "ok", ts: new Date().toISOString() }))
            return
          }

          if (url === "/ready") {
            if (isReady) {
              res.writeHead(200, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ status: "ready", ts: new Date().toISOString() }))
            } else {
              res.writeHead(503, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ status: "not_ready", ts: new Date().toISOString() }))
            }
            return
          }

          if (url === "/metrics" && opts.metricsCallback) {
            opts
              .metricsCallback()
              .then((text) => {
                res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" })
                res.end(text)
              })
              .catch(() => {
                res.writeHead(500)
                res.end("metrics error")
              })
            return
          }

          res.writeHead(404)
          res.end("not found")
        })

        server.on("error", reject)
        server.listen(port, "0.0.0.0", () => resolve(server!))
      }),

    stop: () =>
      new Promise((resolve) => {
        if (!server) { resolve(); return }
        server.close(() => resolve())
      }),
  }

  return handle
}
