/**
 * tests/unit/features/auth.test.ts
 *
 * Unit tests for the 4 new auth flows:
 *   confirmAccount, forgotPassword, resetPassword, changePassword
 *
 * Uses Layer stubs — no real DB / email / token / password dependencies.
 */

import { describe, it, expect } from "bun:test"
import { Effect, Layer, Exit, Cause } from "effect"
import { PostgresService } from "../../../src/infra/postgres/postgresService.ts"
import { TokenService } from "../../../src/app/features/auth/tokenService.ts"
import { PasswordService } from "../../../src/app/features/auth/passwordService.ts"
import { EmailService } from "../../../src/infra/email/emailService.ts"
import { AuthService, AuthServiceLive } from "../../../src/app/features/auth/authService.ts"
import {
  AccountAlreadyConfirmedError,
  InvalidConfirmationCodeError,
  PasswordResetExpiredError,
  PasswordSameAsOldError,
} from "../../../src/core/errors/authErrors.ts"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a PostgresService stub that returns rows from a sequence on each call */
const mockDb = (rowsSequence: Array<Record<string, unknown>[]>) => {
  let call = 0
  return Layer.succeed(
    PostgresService,
    PostgresService.of({
      db: {} as never,
      query: (_fn) => Effect.succeed(rowsSequence[call++] ?? []) as never,
    }),
  )
}

const stubToken = Layer.succeed(
  TokenService,
  TokenService.of({
    signAccess: (_userId, _role) => Effect.succeed("access-token"),
    signRefresh: (_userId) => Effect.succeed("refresh-token"),
    verifyAccess: (_token) => Effect.succeed({ sub: "user1", role: "user", jti: "jti1" }),
    verifyRefresh: (_token) => Effect.succeed({ sub: "user1", jti: "jti1" }),
  }),
)

const stubEmail = Layer.succeed(
  EmailService,
  EmailService.of({
    send: (_params) => Effect.void,
  }),
)

/** PasswordService stub where verify always succeeds */
const stubPasswordAlwaysValid = Layer.succeed(
  PasswordService,
  PasswordService.of({
    hash: (_plaintext) => Effect.succeed("hashed"),
    verify: (_hash, _plaintext) => Effect.void,
  }),
)

const buildLayer = (
  dbLayer: Layer.Layer<PostgresService>,
  passwordLayer: Layer.Layer<PasswordService> = stubPasswordAlwaysValid,
) =>
  AuthServiceLive.pipe(
    Layer.provide(Layer.mergeAll(dbLayer, stubToken, passwordLayer, stubEmail)),
  )

const runExit = <A, E>(
  effect: Effect.Effect<A, E, AuthService>,
  layer: Layer.Layer<AuthService>,
) => Effect.runPromise(Effect.exit(Effect.provide(effect, layer)))

// ── confirmAccount ────────────────────────────────────────────────────────────

describe("AuthService.confirmAccount", () => {
  it("confirms a valid unconfirmed account", async () => {
    const db = mockDb([
      [{ id: "user1", accountConfirmation: { status: false, token: "tok", code: "ABC123", timestamp: null } }],
      [], // update query returns nothing
    ])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.confirmAccount("test@example.com", "ABC123"))),
      layer,
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("fails with AccountAlreadyConfirmedError when already confirmed", async () => {
    const db = mockDb([
      [{ id: "user1", accountConfirmation: { status: true, token: null, code: null, timestamp: "2024-01-01" } }],
    ])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.confirmAccount("test@example.com", "ABC123"))),
      layer,
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(AccountAlreadyConfirmedError)
    }
  })

  it("fails with InvalidConfirmationCodeError on wrong code", async () => {
    const db = mockDb([
      [{ id: "user1", accountConfirmation: { status: false, token: "tok", code: "ABC123", timestamp: null } }],
    ])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.confirmAccount("test@example.com", "WRONG"))),
      layer,
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(InvalidConfirmationCodeError)
    }
  })
})

// ── forgotPassword ────────────────────────────────────────────────────────────

describe("AuthService.forgotPassword", () => {
  it("silently succeeds when user does not exist", async () => {
    const db = mockDb([[]])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.forgotPassword("unknown@example.com"))),
      layer,
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("succeeds when user exists (sets reset token)", async () => {
    const db = mockDb([
      [{ id: "user1", name: "Test" }],
      [], // update query
    ])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.forgotPassword("test@example.com"))),
      layer,
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

// ── resetPassword ─────────────────────────────────────────────────────────────

describe("AuthService.resetPassword", () => {
  it("fails with PasswordResetExpiredError on expired token", async () => {
    const db = mockDb([
      [{
        id: "user1",
        passwordReset: { token: "tok123", expiry: Date.now() - 7200000, lastResetAt: null },
      }],
    ])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.resetPassword("tok123", "newPass123"))),
      layer,
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(PasswordResetExpiredError)
    }
  })

  it("succeeds with valid non-expired token", async () => {
    const db = mockDb([
      [{
        id: "user1",
        passwordReset: { token: "tok123", expiry: Date.now() + 3600000, lastResetAt: null },
      }],
      [], // update query
    ])
    const layer = buildLayer(db)
    const exit = await runExit(
      AuthService.pipe(Effect.flatMap((svc) => svc.resetPassword("tok123", "newPass123"))),
      layer,
    )
    expect(Exit.isSuccess(exit)).toBe(true)
  })
})

// ── changePassword ────────────────────────────────────────────────────────────

describe("AuthService.changePassword", () => {
  it("fails with PasswordSameAsOldError when new password same as old", async () => {
    // PasswordService always succeeds verify => both old and new pass checks succeed => isSame = true
    const db = mockDb([
      [{ id: "user1", password: "hashed_password" }],
    ])
    const layer = buildLayer(db, stubPasswordAlwaysValid)
    const exit = await runExit(
      AuthService.pipe(
        Effect.flatMap((svc) => svc.changePassword("user1", "oldPass", "oldPass")),
      ),
      layer,
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toBeInstanceOf(PasswordSameAsOldError)
    }
  })
})
