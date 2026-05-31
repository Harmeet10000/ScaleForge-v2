/**
 * src/core/validators/passwordStrength.ts
 *
 * Password strength scoring using zxcvbn.
 *
 * zxcvbn scores passwords 0–4:
 *   0 = Too guessable (risky password)
 *   1 = Very guessable (protection from throttled online attacks)
 *   2 = Somewhat guessable (protection from unthrottled online attacks)
 *   3 = Safely unguessable (moderate protection from offline slow-hash attacks)
 *   4 = Very unguessable (strong protection from offline slow-hash attacks)
 *
 * Project policy: minimum score 2 for registration.
 *
 * Used in:
 *   - Registration schema (Phase 7 — currently enforced by min length only)
 *   - Password change flow
 *   - Frontend meter (return score + feedback to client)
 */

import zxcvbn from "zxcvbn"
import { Schema } from "effect"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PasswordScore = 0 | 1 | 2 | 3 | 4

export interface PasswordStrengthResult {
  readonly score: PasswordScore
  readonly crackTimeSeconds: number
  readonly crackTimeDisplay: string
  readonly warning: string
  readonly suggestions: string[]
  readonly isAcceptable: boolean  // score >= MIN_SCORE
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Minimum acceptable score for new passwords. 2 = protection from unthrottled online attacks. */
export const MIN_PASSWORD_SCORE: PasswordScore = 2

// ── Raw helpers ───────────────────────────────────────────────────────────────

/**
 * Score a password. Pass userInputs (email, name) to penalize
 * passwords that contain personal info.
 */
export const scorePassword = (
  password: string,
  userInputs: string[] = [],
): PasswordStrengthResult => {
  const result = zxcvbn(password, userInputs)
  return {
    score: result.score as PasswordScore,
    crackTimeSeconds: result.crack_times_seconds.offline_slow_hashing_1e4_per_second as number,
    crackTimeDisplay: result.crack_times_display.offline_slow_hashing_1e4_per_second as string,
    warning: result.feedback.warning ?? "",
    suggestions: result.feedback.suggestions,
    isAcceptable: result.score >= MIN_PASSWORD_SCORE,
  }
}

/** Returns true if the password meets the minimum strength requirement. */
export const isStrongEnough = (password: string, userInputs: string[] = []): boolean =>
  zxcvbn(password, userInputs).score >= MIN_PASSWORD_SCORE

// ── Effect Schema validators ──────────────────────────────────────────────────

/**
 * Schema check: validates that a password meets minimum strength.
 * Does NOT include userInputs (name, email) at schema level — those are
 * only available at the service level. Use isStrongEnough() in authService
 * after decoding the body if you want context-aware scoring.
 *
 * Usage:
 *   const PasswordField = Schema.String
 *     .check(Schema.isMinLength(8))
 *     .check(passwordStrengthCheck)
 */
export const passwordStrengthCheck = Schema.check<string>((s, ast, ctx) => {
  const result = zxcvbn(s)
  if (result.score < MIN_PASSWORD_SCORE) {
    const warning = result.feedback.warning
      ? ` ${result.feedback.warning}.`
      : ""
    const tip = result.feedback.suggestions[0] ?? "Try a longer passphrase."
    return ctx.fail(
      ast,
      s,
      `Password is too weak (score ${result.score}/${MIN_PASSWORD_SCORE} minimum).${warning} ${tip}`
    )
  }
  return ctx.succeed(s)
})

/**
 * Strong password Schema — min 8 chars AND zxcvbn score ≥ 2.
 * Use this in Phase 7 registration/password-change routes.
 */
export const StrongPassword = Schema.String
  .check(Schema.isMinLength(8))
  .check(passwordStrengthCheck)
