/**
 * tests/unit/auth/passwordService.test.ts
 *
 * Tests for argon2id hash/verify — no external deps, runs in Bun.
 */

import { describe, it, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { PasswordService, PasswordServiceLive } from "../../../src/app/features/auth2/passwordService.ts"
import { InvalidCredentialsError } from "../../../src/core/errors/authErrors.ts"

const run = <A, E>(effect: Effect.Effect<A, E, PasswordService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(PasswordServiceLive)))

describe("PasswordService", () => {
  it("hashes a password (non-empty result, different from plaintext)", async () => {
    const hash = await run(
      PasswordService.pipe(Effect.flatMap((s) => s.hash("hunter2")))
    )
    expect(typeof hash).toBe("string")
    expect(hash).not.toBe("hunter2")
    expect(hash.length).toBeGreaterThan(20)
  })

  it("verifies a correct password without error", async () => {
    const result = await run(
      PasswordService.pipe(
        Effect.flatMap((s) =>
          Effect.gen(function* () {
            const hash = yield* s.hash("correct-password")
            return yield* s.verify(hash, "correct-password")
          })
        )
      )
    )
    expect(result).toBeUndefined()
  })

  it("fails with InvalidCredentialsError for wrong password", async () => {
    const exit = await Effect.runPromiseExit(
      PasswordService.pipe(
        Effect.flatMap((s) =>
          Effect.gen(function* () {
            const hash = yield* s.hash("correct-password")
            return yield* s.verify(hash, "wrong-password")
          })
        )
      ).pipe(Effect.provide(PasswordServiceLive))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(InvalidCredentialsError)
    }
  })
})
