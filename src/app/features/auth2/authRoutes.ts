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
 *   - httpOnly Secure SameSite=Strict cookie "rt", scoped to /api/v1/auth
 *   - Body field `refreshToken` accepted as fallback (API/mobile clients)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { CookieSerializeOptions } from "@fastify/cookie"
import { Effect, Schema, Result } from "effect"
import { AuthService } from "./authService.ts"
import { requireAuth } from "./authMiddleware.ts"
import { effectHandler } from "../../../runtime/fastifyBridge.ts"

// ── Cookie config ─────────────────────────────────────────────────────────────

const REFRESH_COOKIE = "rt"

const refreshCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: 60 * 60 * 24 * 7,
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

const ConfirmAccountQuery = Schema.Struct({
  email: Schema.NonEmptyString,
  code: Schema.NonEmptyString,
})

const ForgotPasswordBody = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
})

const ResetPasswordBody = Schema.Struct({
  token: Schema.NonEmptyString,
  newPassword: Schema.String.check(Schema.isMinLength(8)),
})

const ChangePasswordBody = Schema.Struct({
  oldPassword: Schema.NonEmptyString,
  newPassword: Schema.String.check(Schema.isMinLength(8)),
})

const decodeConfirmQuery = (query: unknown) => {
  const result = Schema.decodeUnknownResult(ConfirmAccountQuery)(query)
  return Result.isSuccess(result) ? result.success : null
}

const decodeForgotPassword = (body: unknown) => {
  const result = Schema.decodeUnknownResult(ForgotPasswordBody)(body)
  return Result.isSuccess(result) ? result.success : null
}

const decodeResetPassword = (body: unknown) => {
  const result = Schema.decodeUnknownResult(ResetPasswordBody)(body)
  return Result.isSuccess(result) ? result.success : null
}

const decodeChangePassword = (body: unknown) => {
  const result = Schema.decodeUnknownResult(ChangePasswordBody)(body)
  return Result.isSuccess(result) ? result.success : null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const resolveRefreshToken = (req: FastifyRequest, body: { refreshToken?: string }): string | null =>
  req.cookies[REFRESH_COOKIE] ?? body.refreshToken ?? null

const badRequest = async (reply: FastifyReply, message: string): Promise<void> => {
  void reply.status(400).send({ success: false, statusCode: 400, message, data: null })
}

// ── Routes ────────────────────────────────────────────────────────────────────

export const authRoutes = async (fastify: FastifyInstance) => {
  // POST /register
  fastify.post("/auth/register", {
    schema: { tags: ["Auth"], summary: "Register a new user" },
  }, async (req, reply) => {
    const body = decodeRegister(req.body)
    if (!body) return badRequest(reply, "Invalid request body")
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.register(body)),
      { statusCode: 201 },
    )
  })

  // POST /login
  fastify.post("/auth/login", {
    schema: { tags: ["Auth"], summary: "Login and receive PASETO tokens" },
  }, async (req, reply) => {
    const body = decodeLogin(req.body)
    if (!body) return badRequest(reply, "Invalid request body")
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.login(body)),
      {
        transform: ({ tokens, user }, reply) => {
          void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions)
          void reply.status(200).send({
            success: true, statusCode: 200, message: "OK",
            data: { accessToken: tokens.accessToken, user },
          })
        },
      },
    )
  })

  // POST /refresh
  fastify.post("/auth/refresh", {
    schema: { tags: ["Auth"], summary: "Rotate tokens using a refresh token" },
  }, async (req, reply) => {
    const rawBody = decodeRefresh(req.body)
    const body: { refreshToken?: string } = rawBody ? { ...(rawBody.refreshToken !== undefined ? { refreshToken: rawBody.refreshToken } : {}) } : {}
    const refreshToken = resolveRefreshToken(req, body)
    if (!refreshToken) return badRequest(reply, "Missing refresh token")
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.refreshTokens(refreshToken)),
      {
        transform: (tokens, reply) => {
          void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions)
          void reply.status(200).send({
            success: true, statusCode: 200, message: "OK",
            data: { accessToken: tokens.accessToken },
          })
        },
      },
    )
  })

  // POST /logout
  fastify.post("/auth/logout", {
    preHandler: [requireAuth],
    schema: { tags: ["Auth"], summary: "Logout (clear session cookie)" },
  }, async (req, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as unknown as { user?: { sub: string } }).user!.sub
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.logout(userId)),
      {
        transform: (_void, reply) => {
          void reply.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path as string })
          void reply.status(200).send({ success: true, statusCode: 200, message: "Logged out", data: null })
        },
      },
    )
  })

  // GET /me
  fastify.get("/auth/me", {
    preHandler: [requireAuth],
    schema: { tags: ["Auth"], summary: "Get authenticated user profile" },
  }, async (req, reply) => {
    return reply.status(200).send({ success: true, statusCode: 200, message: "OK", data: (req as unknown as { user?: unknown }).user })
  })

  // GET /auth/confirm?email=...&code=...
  fastify.get("/auth/confirm", {
    schema: { tags: ["Auth"], summary: "Confirm account with OTP code" },
  }, async (req, reply) => {
    const query = decodeConfirmQuery(req.query)
    if (!query) return badRequest(reply, "email and code are required query params")
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.confirmAccount(query.email, query.code)),
      {
        transform: (_void, reply) => {
          void reply.status(200).send({ success: true, statusCode: 200, message: "Account confirmed", data: null })
        },
      },
    )
  })

  // POST /auth/forgot-password
  fastify.post("/auth/forgot-password", {
    schema: { tags: ["Auth"], summary: "Request a password reset email" },
  }, async (req, reply) => {
    const body = decodeForgotPassword(req.body)
    if (!body) return badRequest(reply, "Invalid request body")
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.forgotPassword(body.email)),
      {
        transform: (_void, reply) => {
          void reply.status(200).send({
            success: true, statusCode: 200,
            message: "If an account with that email exists, a reset link has been sent.",
            data: null,
          })
        },
      },
    )
  })

  // POST /auth/reset-password
  fastify.post("/auth/reset-password", {
    schema: { tags: ["Auth"], summary: "Reset password using token from email" },
  }, async (req, reply) => {
    const body = decodeResetPassword(req.body)
    if (!body) return badRequest(reply, "Invalid request body")
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.resetPassword(body.token, body.newPassword)),
      {
        transform: (_void, reply) => {
          void reply.status(200).send({ success: true, statusCode: 200, message: "Password reset successfully", data: null })
        },
      },
    )
  })

  // POST /auth/change-password  (requires auth)
  fastify.post("/auth/change-password", {
    preHandler: [requireAuth],
    schema: { tags: ["Auth"], summary: "Change password (authenticated)" },
  }, async (req, reply) => {
    const body = decodeChangePassword(req.body)
    if (!body) return badRequest(reply, "Invalid request body")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as unknown as { user?: { sub: string } }).user!.sub
    return effectHandler(req, reply,
      Effect.flatMap(AuthService, (s) => s.changePassword(userId, body.oldPassword, body.newPassword)),
      {
        transform: (_void, reply) => {
          void reply.status(200).send({ success: true, statusCode: 200, message: "Password changed successfully", data: null })
        },
      },
    )
  })
}
