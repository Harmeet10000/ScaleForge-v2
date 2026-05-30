/**
 * src/app/app.ts  (Fastify — replaces Express version)
 *
 * Builds and returns a fully-configured Fastify instance.
 * Does NOT call listen() — that is main.ts's responsibility.
 */

import Fastify from "fastify"
import cors from "@fastify/cors"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import fastifyBridgePlugin from "../runtime/fastifyBridge.ts"
import { securityPlugin } from "./plugins/security.ts"
import { rateLimitPlugin } from "./plugins/rateLimiting.ts"
import { metricsRoutes } from "./features/metrics/metricsRoutes.ts"
import { adminFeatureFlagRoutes } from "./features/admin/featureFlagRoutes.ts"
import { webhookRoutes } from "./features/webhooks/webhookRoutes.ts"

export const buildApp = async () => {
  const fastify = Fastify({
    logger: false,           // Pino is managed by the Effect layer
    requestIdHeader: "x-correlation-id",
    requestIdLogLabel: "correlationId",
    trustProxy: true,
  })

  // ── Core plugins ────────────────────────────────────────────────────────────
  // 1. Effect runtime decorator (must be first — routes depend on it)
  await fastify.register(fastifyBridgePlugin)

  // 2. Security: Helmet + CSRF
  await fastify.register(securityPlugin)

  // 3. Rate limiting (Redis-backed global limits)
  await fastify.register(rateLimitPlugin)

  // 4. CORS
  await fastify.register(cors, {
    origin: process.env["FRONTEND_URL"] ?? "http://localhost:5173",
    credentials: true,
  })

  // 5. OpenAPI / Swagger
  await fastify.register(swagger, {
    openapi: {
      info: { title: "ScaleForge API", version: "1.0.0", description: "Production-grade API" },
      servers: [{ url: "/api/v1" }],
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    },
  })
  await fastify.register(swaggerUi, {
    routePrefix: "/api-docs",
    uiConfig: { docExpansion: "none", filter: true },
  })

  // ── Routes ───────────────────────────────────────────────────────────────────
  // Prometheus scrape (no /api/v1 prefix, no auth)
  await fastify.register(metricsRoutes)

  // Versioned API prefix
  await fastify.register(async (api) => {
    // Feature flag admin
    await api.register(adminFeatureFlagRoutes)
    // Outbound webhooks
    await api.register(webhookRoutes)
    // TODO (Phase 4): await api.register(healthRoutes)
    // TODO (Phase 5): await api.register(authRoutes)
  }, { prefix: "/api/v1" })

  // 404 fallback
  fastify.setNotFoundHandler((_req, reply) => {
    void reply.status(404).send({ success: false, statusCode: 404, message: "Route not found", data: null })
  })

  return fastify
}
