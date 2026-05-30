/**
 * tests/unit/auth/tokenService.test.ts
 *
 * Tests for PASETO v4.public sign/verify — uses a real generated keypair.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { Effect, Layer, Redacted } from "effect"
import { generateKeys } from "paseto-ts/v4"
import { TokenService, TokenServiceLive } from "../../../src/app/features/auth2/tokenService.ts"
import { AppConfig } from "../../../src/core/config/configService.ts"
import { InvalidTokenError, TokenExpiredError } from "../../../src/core/errors/authErrors.ts"

// Generate a real PASERK keypair for tests
const { secretKey, publicKey } = generateKeys("public")

// Stub AppConfig with the test keypair
const TestAppConfigLayer = Layer.succeed(AppConfig, AppConfig.of({
  port: 3000,
  nodeEnv: "test",
  hostname: "localhost",
  serverId: "test",
  logLevel: "silent",
  isProduction: false,
  isDevelopment: false,
  urls: { frontend: "http://localhost:5173", server: "http://localhost:3000" },
  mongo: { uri: "mongodb://localhost:27017/test", poolSize: 2 },
  postgres: { url: "postgres://localhost:5432/test" },
  redis: { host: "localhost", port: 6379, username: "", password: Redacted.make("") },
  auth: {
    accessTokenSecret: Redacted.make(secretKey),
    refreshTokenSecret: Redacted.make(publicKey),
    accessTokenExpiry: "15m",
    refreshTokenExpiry: "7d",
  },
  rabbitmq: { url: "amqp://localhost" },
  s3: { accessKey: Redacted.make(""), secretAccessKey: Redacted.make(""), bucketName: "", bucketRegion: "" },
  elasticsearch: { host: "", apiKey: Redacted.make("") },
  gemini: { apiKey: Redacted.make("") },
  kafka: { broker: "", clientId: "", groupId: "", topic: "", username: "", password: Redacted.make(""), saslMechanism: "plain", ssl: false },
  email: { resendKey: Redacted.make("") },
  novu: { apiKey: Redacted.make("") },
  observability: { lokiHost: "" },
}))

const TestTokenLayer = TokenServiceLive.pipe(Layer.provide(TestAppConfigLayer))

const run = <A, E>(effect: Effect.Effect<A, E, TokenService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestTokenLayer)))

const runExit = <A, E>(effect: Effect.Effect<A, E, TokenService>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(TestTokenLayer)))

describe("TokenService", () => {
  it("signs and verifies an access token", async () => {
    const result = await run(
      TokenService.pipe(
        Effect.flatMap((s) =>
          Effect.gen(function* () {
            const token = yield* s.signAccess("user-123", "user")
            return yield* s.verifyAccess(token)
          })
        )
      )
    )
    expect(result.sub).toBe("user-123")
    expect(result.role).toBe("user")
    expect(typeof result.jti).toBe("string")
  })

  it("signs and verifies a refresh token", async () => {
    const result = await run(
      TokenService.pipe(
        Effect.flatMap((s) =>
          Effect.gen(function* () {
            const token = yield* s.signRefresh("user-456")
            return yield* s.verifyRefresh(token)
          })
        )
      )
    )
    expect(result.sub).toBe("user-456")
  })

  it("rejects a tampered access token with InvalidTokenError", async () => {
    const exit = await runExit(
      TokenService.pipe(
        Effect.flatMap((s) => s.verifyAccess("v4.public.tampered-garbage"))
      )
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(InvalidTokenError)
    }
  })

  it("rejects a refresh token presented as access token", async () => {
    const exit = await runExit(
      TokenService.pipe(
        Effect.flatMap((s) =>
          Effect.gen(function* () {
            // verifyRefresh on an access token should fail (missing `ref` claim)
            const accessToken = yield* s.signAccess("user-789", "admin")
            return yield* s.verifyRefresh(accessToken)
          })
        )
      )
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(InvalidTokenError)
    }
  })
})
