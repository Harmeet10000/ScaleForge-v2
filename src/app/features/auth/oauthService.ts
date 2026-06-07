/**
 * src/app/features/auth/oauthService.ts
 *
 * Arctic v3 Google OAuth wrapper as an Effect service.
 */

import { Context, Effect, Layer, Redacted } from "effect"
import { Google, generateState, generateCodeVerifier, decodeIdToken } from "arctic"
import { AppConfig } from "../../../core/config/configService.ts"
import { InvalidOAuthCredentialsError } from "../../../core/errors/authErrors.ts"
import type { OAuthUserProfile, OAuthFlowStart } from "./authTypes.ts"

export interface OAuthService {
  readonly startGoogleFlow: () => Effect.Effect<OAuthFlowStart, never>
  readonly exchangeGoogleCode: (
    code: string,
    codeVerifier: string,
  ) => Effect.Effect<OAuthUserProfile, InvalidOAuthCredentialsError>
}

export const OAuthService = Context.Service<OAuthService>("@auth/OAuthService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig
  const google = new Google(
    config.google.clientId,
    Redacted.value(config.google.clientSecret),
    config.google.redirectUri,
  )

  const startGoogleFlow = (): Effect.Effect<OAuthFlowStart, never> =>
    Effect.sync(() => {
      const state = generateState()
      const codeVerifier = generateCodeVerifier()
      // Arctic v3: createAuthorizationURL(state, codeVerifier, scopes[])
      const authorizationUrl = google.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "email",
        "profile",
      ])
      return { authorizationUrl: authorizationUrl.toString(), state, codeVerifier }
    })

  const exchangeGoogleCode = (
    code: string,
    codeVerifier: string,
  ): Effect.Effect<OAuthUserProfile, InvalidOAuthCredentialsError> =>
    Effect.tryPromise({
      try: async () => {
        // Arctic v3: validateAuthorizationCode(code, codeVerifier)
        const tokens = await google.validateAuthorizationCode(code, codeVerifier)
        const idToken = tokens.idToken()
        // Arctic v3 exports decodeIdToken for safe JWT claim parsing
        const claims = decodeIdToken(idToken) as {
          sub: string
          email: string
          name: string
          picture?: string
        }
        return {
          id: claims.sub,
          email: claims.email,
          name: claims.name,
          picture: claims.picture ?? null,
        } satisfies OAuthUserProfile
      },
      catch: (err) =>
        new InvalidOAuthCredentialsError({ provider: `google: ${String(err)}` }),
    })

  return OAuthService.of({ startGoogleFlow, exchangeGoogleCode })
})

export const OAuthServiceLive = Layer.effect(OAuthService, make)
