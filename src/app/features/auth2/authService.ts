/**
 * src/app/features/auth2/authService.ts
 *
 * Core auth business logic — no HTTP/Fastify imports.
 * Operations: register, login, refreshTokens, logout,
 *             confirmAccount, forgotPassword, resetPassword, changePassword.
 *
 * Depends on: PostgresService (users table), TokenService, PasswordService, EmailService.
 */

import { Context, Effect, Layer } from "effect"
import { eq, sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { randomBytes } from "node:crypto"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { TokenService } from "./tokenService.ts"
import { PasswordService } from "./passwordService.ts"
import { EmailService } from "../../../infra/email/emailService.ts"
import { users } from "../../../db/schema/userSchema.ts"
import {
  UserAlreadyExistsError,
  UserNotFoundError,
  InvalidCredentialsError,
  InvalidTokenError,
  TokenExpiredError,
  AccountAlreadyConfirmedError,
  InvalidConfirmationCodeError,
  PasswordResetExpiredError,
  PasswordSameAsOldError,
  InvalidOldPasswordError,
} from "../../../core/errors/authErrors.ts"
import type { OAuthUserProfile } from "./oauthService.ts"

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  readonly name: string
  readonly email: string
  readonly password: string
  readonly consent?: boolean
  readonly phoneNumber?: string
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
  readonly confirmAccount: (email: string, code: string) => Effect.Effect<
    void,
    UserNotFoundError | AccountAlreadyConfirmedError | InvalidConfirmationCodeError
  >
  readonly forgotPassword: (email: string) => Effect.Effect<void, never>
  readonly resetPassword: (token: string, newPassword: string) => Effect.Effect<
    void,
    InvalidTokenError | PasswordResetExpiredError
  >
  readonly changePassword: (userId: string, oldPassword: string, newPassword: string) => Effect.Effect<
    void,
    UserNotFoundError | InvalidOldPasswordError | PasswordSameAsOldError
  >
  readonly handleGoogleOAuth: (profile: OAuthUserProfile) => Effect.Effect<
    { tokens: AuthTokens; user: UserProfile; isNewUser: boolean },
    never
  >
}

export const AuthService = Context.Service<AuthService>("@auth/AuthService")

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const postgres = yield* PostgresService
  const tokenSvc = yield* TokenService
  const passwordSvc = yield* PasswordService
  const emailSvc = yield* EmailService

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

      // 3. Generate confirmation code and token
      const confirmCode = Math.random().toString(36).slice(2, 8).toUpperCase()
      const confirmToken = createId()

      // 4. Insert user
      const id = createId()
      yield* postgres.query((db) =>
        db.insert(users).values({
          id,
          name: input.name,
          emailAddress: input.email,
          password: hashedPassword,
          role: "user",
          ...(input.consent !== undefined ? { consent: input.consent } : {}),
          ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
          accountConfirmation: {
            status: false,
            token: confirmToken,
            code: confirmCode,
            timestamp: new Date().toISOString(),
          },
        })
      ).pipe(Effect.orDie)

      // 5. Fire-and-forget confirmation email
      yield* emailSvc.send({
        to: [input.email],
        subject: "Confirm Your Account",
        html: `<p>Your confirmation code is: <strong>${confirmCode}</strong></p>`,
      }).pipe(Effect.ignore)

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

  const confirmAccount = (email: string, code: string) =>
    Effect.gen(function* () {
      const rows = yield* postgres.query((db) =>
        db.select({ id: users.id, accountConfirmation: users.accountConfirmation })
          .from(users)
          .where(eq(users.emailAddress, email))
          .limit(1)
      ).pipe(Effect.orDie)

      const user = rows[0]
      if (!user) return yield* Effect.fail(new UserNotFoundError({ identifier: email }))

      const conf = user.accountConfirmation as import("../../../db/schema/userSchema.ts").AccountConfirmation | null
      if (conf?.status === true) {
        return yield* Effect.fail(new AccountAlreadyConfirmedError({ email }))
      }
      if (!conf?.code || conf.code !== code) {
        return yield* Effect.fail(new InvalidConfirmationCodeError())
      }

      yield* postgres.query((db) =>
        db.update(users)
          .set({
            isVerified: true,
            accountConfirmation: {
              status: true,
              token: null,
              code: null,
              timestamp: new Date().toISOString(),
            },
          })
          .where(eq(users.id, user.id))
      ).pipe(Effect.orDie)
    })

  const forgotPassword = (email: string) =>
    Effect.gen(function* () {
      const rows = yield* postgres.query((db) =>
        db.select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.emailAddress, email))
          .limit(1)
      ).pipe(Effect.orDie)

      const user = rows[0]
      if (!user) return  // Silent — prevents email enumeration

      const token = randomBytes(32).toString("hex")
      const expiry = Date.now() + 60 * 60 * 1000  // 1 hour

      yield* postgres.query((db) =>
        db.update(users)
          .set({ passwordReset: { token, expiry, lastResetAt: null } })
          .where(eq(users.id, user.id))
      ).pipe(Effect.orDie)

      const resetUrl = `${process.env["FRONTEND_URL"] ?? "http://localhost:3000"}/reset-password?token=${token}`
      yield* emailSvc.send({
        to: [email],
        subject: "Reset Your Password",
        html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Expires in 1 hour.</p>`,
      }).pipe(Effect.ignore)
    })

  const resetPassword = (token: string, newPassword: string) =>
    Effect.gen(function* () {
      const rows = yield* postgres.query((db) =>
        db.select({ id: users.id, passwordReset: users.passwordReset })
          .from(users)
          .where(sql`password_reset->>'token' = ${token}`)
          .limit(1)
      ).pipe(Effect.orDie)

      const user = rows[0]
      if (!user) return yield* Effect.fail(new InvalidTokenError({ reason: "reset token not found" }))

      const pr = user.passwordReset as import("../../../db/schema/userSchema.ts").PasswordReset | null
      if (!pr?.expiry || Date.now() > pr.expiry) {
        return yield* Effect.fail(new PasswordResetExpiredError())
      }

      const hashedPassword = yield* passwordSvc.hash(newPassword)

      yield* postgres.query((db) =>
        db.update(users)
          .set({
            password: hashedPassword,
            passwordReset: { token: null, expiry: null, lastResetAt: new Date().toISOString() },
          })
          .where(eq(users.id, user.id))
      ).pipe(Effect.orDie)
    })

  const changePassword = (userId: string, oldPassword: string, newPassword: string) =>
    Effect.gen(function* () {
      const rows = yield* postgres.query((db) =>
        db.select({ id: users.id, password: users.password })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
      ).pipe(Effect.orDie)

      const user = rows[0]
      if (!user) return yield* Effect.fail(new UserNotFoundError({ identifier: userId }))

      yield* passwordSvc.verify(user.password, oldPassword).pipe(
        Effect.mapError(() => new InvalidOldPasswordError())
      )

      const isSame = yield* passwordSvc.verify(user.password, newPassword).pipe(
        Effect.map(() => true),
        Effect.orElseSucceed(() => false),
      )
      if (isSame) return yield* Effect.fail(new PasswordSameAsOldError())

      const hashed = yield* passwordSvc.hash(newPassword)
      yield* postgres.query((db) =>
        db.update(users).set({ password: hashed }).where(eq(users.id, user.id))
      ).pipe(Effect.orDie)
    })

  const handleGoogleOAuth = (profile: OAuthUserProfile) =>
    Effect.gen(function* () {
      // Look up user by email
      const rows = yield* postgres.query((db) =>
        db.select({ id: users.id, name: users.name, email: users.emailAddress, role: users.role })
          .from(users)
          .where(eq(users.emailAddress, profile.email))
          .limit(1)
      ).pipe(Effect.orDie)

      let userId: string
      let userName: string
      let userRole: string
      let isNewUser = false

      if (rows.length > 0) {
        const u = rows[0]!
        userId = u.id
        userName = u.name
        userRole = (u.role as string | null) ?? "user"
      } else {
        // Create new user (no password — OAuth-only account)
        userId = createId()
        userName = profile.name
        userRole = "user"
        isNewUser = true
        yield* postgres.query((db) =>
          db.insert(users).values({
            id: userId,
            name: profile.name,
            emailAddress: profile.email,
            password: "",
            role: "user",
            isVerified: true,
            accountConfirmation: {
              status: true,
              token: null,
              code: null,
              timestamp: new Date().toISOString(),
            },
          })
        ).pipe(Effect.orDie)
      }

      const [accessToken, refreshToken] = yield* Effect.all([
        tokenSvc.signAccess(userId, userRole),
        tokenSvc.signRefresh(userId),
      ])

      return {
        tokens: { accessToken, refreshToken } satisfies AuthTokens,
        user: { id: userId, name: userName, email: profile.email, role: userRole } satisfies UserProfile,
        isNewUser,
      }
    })

  return AuthService.of({
    register, login, refreshTokens, logout,
    confirmAccount, forgotPassword, resetPassword, changePassword,
    handleGoogleOAuth,
  })
})

export const AuthServiceLive = Layer.effect(
  AuthService,
  make
)
