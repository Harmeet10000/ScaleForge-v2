/**
 * src/app/features/auth2/authTypes.ts
 *
 * Shared DTOs for the auth feature.
 * Single source of truth — imported by authService.ts and oauthService.ts.
 */

// ── Auth DTOs ─────────────────────────────────────────────────────────────────

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

// ── OAuth DTOs ────────────────────────────────────────────────────────────────

export interface OAuthUserProfile {
  readonly id: string // Google sub
  readonly email: string
  readonly name: string
  readonly picture: string | null
}

export interface OAuthFlowStart {
  readonly authorizationUrl: string
  readonly state: string
  readonly codeVerifier: string
}
