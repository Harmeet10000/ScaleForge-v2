/**
 * src/app/main.ts  (new entry point)
 *
 * Starts the Fastify server. Keeps startup concerns out of app.ts
 * so the app module stays testable without binding a port.
 */

import "./config/dotenvConfig.js"
import { buildApp } from "./app.ts"

const start = async () => {
  const app = await buildApp()
  const port = Number(process.env["PORT"] ?? 3000)
  const host = process.env["HOSTNAME"] ?? "0.0.0.0"

  try {
    await app.listen({ port, host })
    app.log.info(`Server running on port ${port} in ${process.env.NODE_ENV} mode`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down gracefully`)
    await app.close()   // triggers onClose → appRuntime.dispose()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT",  () => void shutdown("SIGINT"))
  process.on("unhandledRejection", (err) => {
    app.log.error({ err }, "Unhandled rejection — shutting down")
    void shutdown("unhandledRejection")
  })
}

void start()
