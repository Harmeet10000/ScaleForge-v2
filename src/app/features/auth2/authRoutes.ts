/**
 * src/app/features/auth2/authRoutes.ts
 *
 * POST /api/v1/auth/register
 * POST /api/v1/auth/login
 * POST /api/v1/auth/refresh
 * POST /api/v1/auth/logout
 * GET  /api/v1/auth/me
 *
 * Refresh token strategy:
 *   - Stored in httpOnly; Secure; SameSite=Strict cookie named "rt"
 *   - Cookie is scoped to /api/v1/auth to minimise exposure surface
 *   - Body field `refreshToken` accepted as fallback (API clients / mobile)
 *   - On logout the cookie is cleared server-side
 */

import type { FastifyInstance, FastifyReply, FastifyRequest, CookieSerializeOptions } from "fastify"
import { Effect, Schema, Cause, Result } from "effect"
import { AuthService } from "./authService.ts"
import { requireAuth } from "./authMiddleware.ts"
import { toHttpError } from "../../../core/errors/httpErrors.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"

// ── Cookie config ─────────────────────────────────────────────────────────────

const REFRESH_COOKIE = "rt"

const refreshCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: 60 * 60 * 24 * 7, // 7 days — matches refresh token TTL
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const RegisterBody = Schema.Struct({
  name: Schema.NonEmptyString,
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  password: Schema.String.check(Schema.isMinLength(8)),
})

const LoginBody = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
})

// refreshToken body field is optional — cookie is the primary transport.
const RefreshBody = Schema.Struct({
  refreshToken: Schema.optional(Schema.NonEmptyString),
})

// ── Decode helpers ────────────────────────────────────────────────────────────

const decodeRegister = (body: unknown) => {
  const result = Schema.decodeUnknownResult(RegisterBody)(body)
  return Result.isSuccess(result) ? result.success : null
}

const decodeLogin = (body: unknown) => {
  const result = Schema.decodeUnknownResult(LoginBody)(body)
  return Result.isSuccess(result) ? result.success : null
}

const decodeRefresh = (body: unknown) => {
  const result = Schema.decodeUnknownResult(RefreshBody)(body)
  return Result.isSuccess(result) ? result.success : null
}

// ── Helper: resolve refresh token from cookie or body ────────────────────────

const resolveRefreshToken = (req: FastifyRequest, body: { refreshToken?: string }): string | null =>
  req.cookies[REFRESH_COOKIE] ?? body.refreshToken ?? null

// ── Helper: run AuthService effect → HTTP response ────────────────────────────

const runAuth = async <A>(
  fastify: FastifyInstance,
  reply: FastifyReply,
  effect: Effect.Effect<A, AppError, AuthService>
) => {
  const exit = await fastify.effectRuntime.runPromiseExit(
    AuthService.pipe(Effect.flatMap(() => effect))
  )
  if (exit._tag === "Success") {
    return reply.status(200).send({ success: true, statusCode: 200, message: "OK", data: exit.value })
  }
  const errorResult = Cause.findError(exit.cause)
  if (Result.isSuccess(errorResult)) {
    const http = toHttpError(errorResult.success as AppError)
    return reply.status(http.statusCode).send(http)
  }
  return reply.status(500).send({ success: false, statusCode: 500, message: "Internal server error", data: null })
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const authRoutes = async (fastify: FastifyInstance) => {
  // POST /api/v1/auth/register
  fastify.post("/auth/register", {
    schema: { tags: ["Auth"], summary: "Register a new user" },
  }, async (req, reply) => {
    const body = decodeRegister(req.body)
    if (!body) return reply.status(400).send({ success: false, statusCode: 400, message: "Invalid request body", data: null })
    return runAuth(fastify, reply,
      Effect.flatMap(AuthService, (s) => s.register(body))
    )
  })

  // POST /api/v1/auth/login — returns access token in body; refresh token in cookie
  fastify.post("/auth/login", {
    schema: { tags: ["Auth"], summary: "Login and receive PASETO tokens" },
  }, async (req, reply) => {
    const body = decodeLogin(req.body)
    if (!body) return reply.status(400).send({ success: false, statusCode: 400, message: "Invalid request body", data: null })

    const exit = await fastify.effectRuntime.runPromiseExit(
      Effect.flatMap(AuthService, (s) => s.login(body))
    )

    if (exit._tag === "Success") {
      const { tokens, user } = exit.value
      // Refresh token goes in httpOnly cookie; access token in body only
      void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions)
      return reply.status(200).send({
        success: true,
        statusCode: 200,
        message: "OK",
        data: { accessToken: tokens.accessToken, user },
      })
    }

    const errorResult = Cause.findError(exit.cause)
    if (Result.isSuccess(errorResult)) {
      const http = toHttpError(errorResult.success as AppError)
      return reply.status(http.statusCode).send(http)
    }
    return reply.status(500).send({ success: false, statusCode: 500, message: "Internal server error", data: null })
  })

  // POST /api/v1/auth/refresh — reads refresh token from cookie; body is fallback
  fastify.post("/auth/refresh", {
    schema: { tags: ["Auth"], summary: "Rotate tokens using a refresh token" },
  }, async (req, reply) => {
    const body = decodeRefresh(req.body) ?? {}
    const refreshToken = resolveRefreshToken(req, body)
    if (!refreshToken) {
      return reply.status(400).send({ success: false, statusCode: 400, message: "Missing refresh token", data: null })
    }

    const exit = await fastify.effectRuntime.runPromiseExit(
      Effect.flatMap(AuthService, (s) => s.refreshTokens(refreshToken))
    )

    if (exit._tag === "Success") {
      const tokens = exit.value
      // Rotate cookie with the new refresh token
      void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions)
      return reply.status(200).send({
        success: true,
        statusCode: 200,
        message: "OK",
        data: { accessToken: tokens.accessToken },
      })
    }

    const errorResult = Cause.findError(exit.cause)
    if (Result.isSuccess(errorResult)) {
      const http = toHttpError(errorResult.success as AppError)
      return reply.status(http.statusCode).send(http)
    }
    return reply.status(500).send({ success: false, statusCode: 500, message: "Internal server error", data: null })
  })

  // POST /api/v1/auth/logout — clears the refresh-token cookie
  fastify.post("/auth/logout", {
    preHandler: [requireAuth],
    schema: { tags: ["Auth"], summary: "Logout (clear session cookie)" },
  }, async (req, reply) => {
    const userId = req.user!.sub
    await fastify.effectRuntime.runPromise(
      Effect.flatMap(AuthService, (s) => s.logout(userId))
    )
    void reply.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path })
    return reply.status(200).send({ success: true, statusCode: 200, message: "Logged out", data: null })
  })

  // GET /api/v1/auth/me
  fastify.get("/auth/me", {
    preHandler: [requireAuth],
    schema: { tags: ["Auth"], summary: "Get authenticated user profile" },
  }, async (req, reply) => {
    return reply.status(200).send({ success: true, statusCode: 200, message: "OK", data: req.user })
  })
}
