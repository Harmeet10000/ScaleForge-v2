/**
 * src/app/app.ts  (Fastify — replaces Express version)
 *
 * Builds and returns a fully-configured Fastify instance.
 * Does NOT call listen() — that is main.ts's responsibility.
 */

import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import compress from "@fastify/compress"
import underPressure from "@fastify/under-pressure"
import requestContextPlugin from "@fastify/request-context"
import formbody from "@fastify/formbody"
import responseValidation from "@fastify/response-validation"
import fastifyOtel from "@fastify/otel"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import fastifyBridgePlugin from "../runtime/fastifyBridge.ts"
import { securityPlugin } from "./plugins/security.ts"
import { rateLimitPlugin } from "./plugins/rateLimiting.ts"
import { metricsRoutes } from "./features/metrics/metricsRoutes.ts"
import { healthRoutes } from "./features/health/healthRoutes.ts"
import { adminFeatureFlagRoutes } from "./features/admin/featureFlagRoutes.ts"
import { webhookRoutes } from "./features/webhooks/webhookRoutes.ts"
import { authRoutes } from "./features/auth2/authRoutes.ts"

export const buildApp = async () => {
  const fastify = Fastify({
    logger: false,           // Pino is managed by the Effect layer
    requestIdHeader: "x-correlation-id",
    requestIdLogLabel: "correlationId",
    trustProxy: true,
  })

  // ── Core plugins ─────────────────────────────────────────────────────────────
  // 1. Effect runtime decorator + correlation-ID request-context hook
  await fastify.register(fastifyBridgePlugin)

  // 2. Request context store (x-correlation-id propagation)
  //    Must be registered before routes so req.requestContext is available.
  await fastify.register(requestContextPlugin)

  // 3. Cookie parser (refresh-token httpOnly cookie)
  await fastify.register(cookie)

  // 4. Security: Helmet + CSRF
  await fastify.register(securityPlugin)

  // 5. Rate limiting (Redis-backed global limits)
  await fastify.register(rateLimitPlugin)

  // 6. CORS
  await fastify.register(cors, {
    origin: process.env["FRONTEND_URL"] ?? "http://localhost:5173",
    credentials: true,
  })

  // 7. Brotli/gzip compression for all JSON responses (~60–70% bandwidth saving)
  await fastify.register(compress, { global: true })

  // 8. Back-pressure: auto-503 when CPU/heap exceeds safe thresholds
  await fastify.register(underPressure, {
    maxEventLoopDelay: 1_000,           // 1 s event-loop lag
    maxHeapUsedBytes: 900_000_000,      // 900 MB V8 heap
    maxRssBytes: 1_500_000_000,         // 1.5 GB RSS
    maxEventLoopUtilization: 0.98,      // 98% ELU
    message: "Service unavailable: server under pressure",
    retryAfter: 50,
  })

  // 9. Formbody — parse application/x-www-form-urlencoded (required for OAuth redirect form posts)
  await fastify.register(formbody)

  // 10. OpenTelemetry Fastify instrumentation — adds per-route OTel spans.
  //     Complements @opentelemetry/auto-instrumentations-node by providing
  //     Fastify-native spans with route-level granularity.
  await fastify.register(fastifyOtel, { wrapRoutes: true })

  // 11. Response validation (dev/staging only) — catches response contract drift
  if (process.env["NODE_ENV"] !== "production") {
    await fastify.register(responseValidation, { ajv: { coerceTypes: false } })
  }

  // 12. OpenAPI / Swagger
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

  // ── Routes ────────────────────────────────────────────────────────────────────
  // Prometheus scrape (no /api/v1 prefix, no auth)
  await fastify.register(metricsRoutes)

  // Versioned API prefix
  await fastify.register(async (api) => {
    await api.register(healthRoutes)
    await api.register(authRoutes)
    await api.register(adminFeatureFlagRoutes)
    await api.register(webhookRoutes)
  }, { prefix: "/api/v1" })

  // 404 fallback
  fastify.setNotFoundHandler((_req, reply) => {
    void reply.status(404).send({ success: false, statusCode: 404, message: "Route not found", data: null })
  })

  return fastify
}
