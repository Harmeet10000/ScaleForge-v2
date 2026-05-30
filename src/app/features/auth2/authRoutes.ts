/**
 * src/app/features/auth2/authRoutes.ts
 *
 * POST /api/v1/auth/register
 * POST /api/v1/auth/login
 * POST /api/v1/auth/refresh
 * POST /api/v1/auth/logout
 * GET  /api/v1/auth/me
 */

import type { FastifyInstance, FastifyReply } from "fastify"
import { Effect, Schema, Cause, Result } from "effect"
import { AuthService } from "./authService.ts"
import { requireAuth } from "./authMiddleware.ts"
import { toHttpError } from "../../../core/errors/httpErrors.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"

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

const RefreshBody = Schema.Struct({
  refreshToken: Schema.NonEmptyString,
})

// ── Helper: decode body ───────────────────────────────────────────────────────

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

  // POST /api/v1/auth/login
  fastify.post("/auth/login", {
    schema: { tags: ["Auth"], summary: "Login and receive PASETO tokens" },
  }, async (req, reply) => {
    const body = decodeLogin(req.body)
    if (!body) return reply.status(400).send({ success: false, statusCode: 400, message: "Invalid request body", data: null })
    return runAuth(fastify, reply,
      Effect.flatMap(AuthService, (s) => s.login(body))
    )
  })

  // POST /api/v1/auth/refresh
  fastify.post("/auth/refresh", {
    schema: { tags: ["Auth"], summary: "Rotate tokens using a refresh token" },
  }, async (req, reply) => {
    const body = decodeRefresh(req.body)
    if (!body) return reply.status(400).send({ success: false, statusCode: 400, message: "Invalid request body", data: null })
    return runAuth(fastify, reply,
      Effect.flatMap(AuthService, (s) => s.refreshTokens(body.refreshToken))
    )
  })

  // POST /api/v1/auth/logout
  fastify.post("/auth/logout", {
    preHandler: [requireAuth],
    schema: { tags: ["Auth"], summary: "Logout (invalidate session)" },
  }, async (req, reply) => {
    const userId = req.user!.sub
    await fastify.effectRuntime.runPromise(
      Effect.flatMap(AuthService, (s) => s.logout(userId))
    )
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
