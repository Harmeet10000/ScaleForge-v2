/**
 * src/app/features/auth2/passwordService.ts
 *
 * argon2id password hashing — the only place argon2 is imported.
 */

import { Context, Effect, Layer } from "effect"
import argon2 from "argon2"
import { InvalidCredentialsError } from "../../../core/errors/authErrors.ts"

export interface PasswordService {
  readonly hash: (plaintext: string) => Effect.Effect<string, never>
  readonly verify: (hash: string, plaintext: string) => Effect.Effect<void, InvalidCredentialsError>
}

export const PasswordService = Context.Service<PasswordService>("@auth/PasswordService")

// OWASP-recommended argon2id parameters (2024)
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const

const make = Effect.sync(() =>
  PasswordService.of({
    hash: (plaintext) =>
      Effect.tryPromise({
        try: () => argon2.hash(plaintext, ARGON2_OPTIONS),
        catch: () => new InvalidCredentialsError(),  // never actually thrown from hash
      }).pipe(
        Effect.orDie  // hash failure is always a defect, not a typed error
      ),

    verify: (hash, plaintext) =>
      Effect.tryPromise({
        try: () => argon2.verify(hash, plaintext),
        catch: () => new InvalidCredentialsError(),
      }).pipe(
        Effect.flatMap((valid) =>
          valid ? Effect.void : Effect.fail(new InvalidCredentialsError())
        )
      ),
  })
)

export const PasswordServiceLive = Layer.effect(PasswordService, make)
