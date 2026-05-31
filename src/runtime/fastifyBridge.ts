/**
 * src/runtime/fastifyBridge.ts
 *
 * Registers the shared ManagedRuntime as a Fastify decorator (`effectRuntime`)
 * so that any route handler can call `fastify.effectRuntime.runPromise(...)`.
 *
 * Uses fastify-plugin so the decorator is not scoped — it is available on the
 * root Fastify instance and all child contexts.
 *
 * Also wires correlation-ID propagation: each inbound request's ID is stored
 * in the @fastify/request-context store so non-Effect code can access it, and
 * is annotated onto any Effect log calls via Effect.annotateLogs.
 */

import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"
import { requestContext } from "@fastify/request-context"
import { appRuntime } from "./appRuntime.ts"

// ── TypeScript: extend the request-context store shape ───────────────────────
declare module "@fastify/request-context" {
  interface RequestContextData {
    correlationId: string
  }
}

// ── TypeScript: teach Fastify that `fastify.effectRuntime` exists ─────────────
declare module "fastify" {
  interface FastifyInstance {
    effectRuntime: typeof appRuntime
  }
}

const fastifyBridgePlugin = fp(async (fastify: FastifyInstance) => {
  // 1. Expose the ManagedRuntime to all route handlers.
  fastify.decorate("effectRuntime", appRuntime)

  // 2. Per-request: store correlation ID in the request-context store.
  //    This makes it available to any code (Effect or not) in the request
  //    lifecycle via `requestContext.get('correlationId')`.
  fastify.addHook("onRequest", (req, _reply, done) => {
    requestContext.set("correlationId", req.id)
    done()
  })

  // 3. Dispose the runtime on server close to allow graceful shutdown of
  //    all Effect managed resources (DB connections, RabbitMQ, OTel, etc.)
  fastify.addHook("onClose", async () => {
    await appRuntime.dispose()
  })
})

export default fastifyBridgePlugin
