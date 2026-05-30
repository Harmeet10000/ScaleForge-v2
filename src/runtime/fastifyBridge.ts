/**
 * src/runtime/fastifyBridge.ts
 *
 * Registers the shared ManagedRuntime as a Fastify decorator (`effectRuntime`)
 * so that any route handler can call `fastify.effectRuntime.runPromise(...)`.
 *
 * Uses fastify-plugin so the decorator is not scoped — it is available on the
 * root Fastify instance and all child contexts.
 */

import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"
import { appRuntime } from "./appRuntime.ts"

// Declaration merging: teach TypeScript that `fastify.effectRuntime` exists.
declare module "fastify" {
  interface FastifyInstance {
    effectRuntime: typeof appRuntime
  }
}

const fastifyBridgePlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorate("effectRuntime", appRuntime)

  // Dispose the runtime on server close to allow graceful shutdown of
  // all Effect managed resources (DB connections, RabbitMQ, OTel, etc.)
  fastify.addHook("onClose", async () => {
    await appRuntime.dispose()
  })
})

export default fastifyBridgePlugin
