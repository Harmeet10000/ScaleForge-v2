/**
 * src/app/features/auth2/tokenService.ts
 *
 * PASETO v4.public tokens — Ed25519 sign/verify.
 * Two tokens issued per session:
 *   accessToken  — short-lived (15m default), carries userId + role
 *   refreshToken — long-lived (7d default), carries only userId + jti
 *
 * Keys are PASERK strings loaded from AppConfig (env vars).
 */

import { Context, Effect, Layer, Redacted } from "effect"
import { sign, verify } from "paseto-ts/v4"
import { AppConfig } from "../../../core/config/configService.ts"
import {
  InvalidTokenError,
  TokenExpiredError,
} from "../../../core/errors/authErrors.ts"
import { createId } from "@paralleldrive/cuid2"

export interface AccessTokenPayload {
  readonly sub: string    // userId
  readonly role: string
  readonly jti: string
}

export interface RefreshTokenPayload {
  readonly sub: string    // userId
  readonly jti: string
}

export interface TokenService {
  readonly signAccess: (userId: string, role: string) => Effect.Effect<string, never>
  readonly signRefresh: (userId: string) => Effect.Effect<string, never>
  readonly verifyAccess: (token: string) => Effect.Effect<AccessTokenPayload, InvalidTokenError | TokenExpiredError>
  readonly verifyRefresh: (token: string) => Effect.Effect<RefreshTokenPayload, InvalidTokenError | TokenExpiredError>
}

export const TokenService = Context.Service<TokenService>("@auth/TokenService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig
  const secretKey = Redacted.value(config.auth.accessTokenSecret)
  const publicKey = Redacted.value(config.auth.refreshTokenSecret)

  // In PASETO v4.public, both signing and verification use the PASERK keypair.
  // We store them as "sk" and "pk" respectively; config holds them as Redacted<string>.
  // accessTokenSecret = PASERK secretKey (k4.secret.*)
  // refreshTokenSecret = PASERK publicKey (k4.public.*) — used to verify access tokens
  // For refresh tokens we use local (symmetric) encryption but treat the secret the same.
  // NOTE: Proper key derivation (separate keypairs per token type) is done in key rotation.

  const signAccess = (userId: string, role: string): Effect.Effect<string, never> =>
    Effect.sync(() =>
      sign(secretKey, {
        sub: userId,
        role,
        jti: createId(),
        exp: `${config.auth.accessTokenExpiry}`,  // e.g. "15m"
      })
    )

  const signRefresh = (userId: string): Effect.Effect<string, never> =>
    Effect.sync(() =>
      sign(secretKey, {
        sub: userId,
        jti: createId(),
        exp: `${config.auth.refreshTokenExpiry}`,  // e.g. "7d"
        ref: true,  // custom claim to distinguish refresh from access tokens
      })
    )

  const verifyAccess = (token: string): Effect.Effect<AccessTokenPayload, InvalidTokenError | TokenExpiredError> =>
    Effect.try({
      try: () => {
        const { payload } = verify<AccessTokenPayload>(publicKey, token)
        if (!payload.sub || !payload.role) throw new Error("missing claims")
        return payload
      },
      catch: (err) => {
        const msg = String((err as Error).message ?? err)
        if (msg.includes("exp") || msg.includes("expired")) {
          return new TokenExpiredError({ tokenType: "access" })
        }
        return new InvalidTokenError({ reason: msg })
      },
    })

  const verifyRefresh = (token: string): Effect.Effect<RefreshTokenPayload, InvalidTokenError | TokenExpiredError> =>
    Effect.try({
      try: () => {
        const { payload } = verify<RefreshTokenPayload>(publicKey, token)
        if (!payload.sub || !(payload as { ref?: boolean }).ref) throw new Error("not a refresh token")
        return payload
      },
      catch: (err) => {
        const msg = String((err as Error).message ?? err)
        if (msg.includes("exp") || msg.includes("expired")) {
          return new TokenExpiredError({ tokenType: "refresh" })
        }
        return new InvalidTokenError({ reason: msg })
      },
    })

  return TokenService.of({ signAccess, signRefresh, verifyAccess, verifyRefresh })
})

export const TokenServiceLive = Layer.effect(TokenService, make)
