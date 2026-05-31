/**
 * src/app/main.ts  (new entry point)
 *
 * Starts the Fastify server. Keeps startup concerns out of app.ts
 * so the app module stays testable without binding a port.
 *
 * Graceful shutdown is handled by close-with-grace which gives a 10 s
 * deadline for in-flight requests to drain before force-killing the process.
 * Replaces the manual process.on('SIGTERM') / process.on('SIGINT') pattern.
 */

import "./config/dotenvConfig.js"
import closeWithGrace from "close-with-grace"
import { buildApp } from "./app.ts"

const start = async () => {
  const app = await buildApp()

  // Register close-with-grace BEFORE listen so the handler is in place
  // even if listen itself throws.
  const closeListeners = closeWithGrace(
    { delay: 10_000 },
    async ({ signal, err }) => {
      if (err) {
        app.log.error({ err }, "Unhandled error — initiating shutdown")
      } else {
        app.log.info(`${signal ?? "manual close"} received — shutting down gracefully`)
      }
      // Closes Fastify which triggers the onClose hook → appRuntime.dispose()
      await app.close()
    },
  )

  // Uninstall the close-with-grace listeners after Fastify has fully closed
  // so they don't fire a second time during test teardown.
  app.addHook("onClose", (_inst, done) => {
    closeListeners.uninstall()
    done()
  })

  const port = Number(process.env["PORT"] ?? 3000)
  const host = process.env["HOSTNAME"] ?? "0.0.0.0"

  try {
    await app.listen({ port, host })
    app.log.info(`Server running on port ${port} in ${process.env.NODE_ENV} mode`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
