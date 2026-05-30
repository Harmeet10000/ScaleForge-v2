import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"
import helmet from "@fastify/helmet"
import csrf from "@fastify/csrf-protection"

// Routes that must be exempt from CSRF (webhook receivers + OAuth callbacks)
const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/payments/webhook",
  "/api/v1/auth/oauth",
  "/metrics",
] as const

export const securityPlugin = fp(async (fastify: FastifyInstance) => {
  // Helmet: X-Frame-Options, HSTS, X-Content-Type-Options, CSP, etc.
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],   // Swagger UI needs inline styles
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // Must be false to allow Swagger UI to load in <iframe>
    crossOriginEmbedderPolicy: false,
  })

  // CSRF — double-submit signed cookie pattern for SPA clients.
  // Exempt webhook + OAuth routes (they use signature/token verification instead).
  await fastify.register(csrf, {
    sessionPlugin: "@fastify/cookie",
    cookieOpts: {
      signed: true,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env["NODE_ENV"] === "production",
      path: "/",
    },
    getToken: (req) => {
      // Exempt specific prefixes from CSRF
      const isExempt = CSRF_EXEMPT_PREFIXES.some((prefix) =>
        req.url.startsWith(prefix)
      )
      if (isExempt) return req.headers["x-csrf-token"] as string ?? "exempt"
      return req.headers["x-csrf-token"] as string
    },
  })
})
