/**
 * src/app/features/auth2/authService.ts
 *
 * Core auth business logic — no HTTP/Fastify imports.
 * Operations: register, login, refreshTokens, logout.
 *
 * Depends on: PostgresService (users table), TokenService, PasswordService.
 */

import { Context, Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { TokenService } from "./tokenService.ts"
import { PasswordService } from "./passwordService.ts"
import { users } from "../../../db/schema/userSchema.ts"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  InvalidCredentialsError,
  InvalidTokenError,
  TokenExpiredError,
} from "../../../core/errors/authErrors.ts"

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  readonly name: string
  readonly email: string
  readonly password: string
}

export interface LoginInput {
  readonly email: string
  readonly password: string
}

export interface AuthTokens {
  readonly accessToken: string
  readonly refreshToken: string
}

export interface UserProfile {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: string
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface AuthService {
  readonly register: (input: RegisterInput) => Effect.Effect<
    UserProfile,
    UserAlreadyExistsError
  >
  readonly login: (input: LoginInput) => Effect.Effect<
    { tokens: AuthTokens; user: UserProfile },
    UserNotFoundError | InvalidCredentialsError
  >
  readonly refreshTokens: (refreshToken: string) => Effect.Effect<
    AuthTokens,
    InvalidTokenError | TokenExpiredError | UserNotFoundError
  >
  readonly logout: (userId: string) => Effect.Effect<void, never>
}

export const AuthService = Context.Service<AuthService>("@auth/AuthService")

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const postgres = yield* PostgresService
  const tokenSvc = yield* TokenService
  const passwordSvc = yield* PasswordService

  const register = (input: RegisterInput) =>
    Effect.gen(function* () {
      // 1. Check for duplicate email
      const existing = yield* postgres.query((db) =>
        db.select({ id: users.id })
          .from(users)
          .where(eq(users.emailAddress, input.email))
          .limit(1)
      ).pipe(Effect.orDie)  // DB errors are defects at this boundary
      if (existing.length > 0) {
        return yield* Effect.fail(new UserAlreadyExistsError({ email: input.email }))
      }

      // 2. Hash password
      const hashedPassword = yield* passwordSvc.hash(input.password)

      // 3. Insert user
      const id = createId()
      yield* postgres.query((db) =>
        db.insert(users).values({
          id,
          name: input.name,
          emailAddress: input.email,
          password: hashedPassword,
          role: "user",
        })
      ).pipe(Effect.orDie)

      return { id, name: input.name, email: input.email, role: "user" } satisfies UserProfile
    })

  const login = (input: LoginInput) =>
    Effect.gen(function* () {
      // 1. Find user
      const rows = yield* postgres.query((db) =>
        db.select({
          id: users.id,
          name: users.name,
          email: users.emailAddress,
          password: users.password,
          role: users.role,
        })
          .from(users)
          .where(eq(users.emailAddress, input.email))
          .limit(1)
      ).pipe(Effect.orDie)
      const user = rows[0]
      if (!user) return yield* Effect.fail(new UserNotFoundError({ identifier: input.email }))

      // 2. Verify password
      yield* passwordSvc.verify(user.password, input.password)

      // 3. Sign tokens
      const role = (user.role as string | null) ?? "user"
      const [accessToken, refreshToken] = yield* Effect.all([
        tokenSvc.signAccess(user.id, role),
        tokenSvc.signRefresh(user.id),
      ])

      return {
        tokens: { accessToken, refreshToken } satisfies AuthTokens,
        user: { id: user.id, name: user.name, email: user.email, role } satisfies UserProfile,
      }
    })

  const refreshTokens = (refreshToken: string) =>
    Effect.gen(function* () {
      // 1. Verify refresh token
      const payload = yield* tokenSvc.verifyRefresh(refreshToken)

      // 2. Confirm user still exists (not deleted/banned)
      const rows = yield* postgres.query((db) =>
        db.select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.id, payload.sub))
          .limit(1)
      ).pipe(Effect.orDie)
      const user = rows[0]
      if (!user) return yield* Effect.fail(new UserNotFoundError({ identifier: payload.sub }))

      // 3. Issue new token pair
      const role = (user.role as string | null) ?? "user"
      const [accessToken, newRefreshToken] = yield* Effect.all([
        tokenSvc.signAccess(user.id, role),
        tokenSvc.signRefresh(user.id),
      ])

      return { accessToken, refreshToken: newRefreshToken } satisfies AuthTokens
    })

  // Logout is stateless for now (tokens expire naturally).
  // Phase 6 will add a token denylist backed by Redis.
  const logout = (_userId: string) => Effect.void

  return AuthService.of({ register, login, refreshTokens, logout })
})

export const AuthServiceLive = Layer.effect(
  AuthService,
  make
)
