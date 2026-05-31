/**
 * src/core/validators/phoneNumber.ts
 *
 * Phone number validation using libphonenumber-js.
 *
 * Used in:
 *   - User profile update Schema (Phase 7)
 *   - Registration flow if phone is collected
 *
 * Effect Schema integration:
 *   Schema.String.check(isValidPhoneNumber)
 *   Schema.String.pipe(Schema.transformOrFail(parsePhoneNumber, ...))
 */

import { parsePhoneNumberFromString, isValidPhoneNumber, getCountries } from "libphonenumber-js"
import type { CountryCode } from "libphonenumber-js"
import { Schema } from "effect"

// ── Raw helpers (use in non-Schema code) ─────────────────────────────────────

/** Returns true if the E.164 phone number is valid for any country. */
export const isValid = (phone: string): boolean => {
  try {
    return isValidPhoneNumber(phone)
  } catch {
    return false
  }
}

/** Returns true if the phone is valid for a specific country code (e.g. "US"). */
export const isValidForCountry = (phone: string, country: CountryCode): boolean => {
  try {
    return isValidPhoneNumber(phone, country)
  } catch {
    return false
  }
}

/**
 * Parse a phone number string into a structured object.
 * Returns null if unparseable.
 */
export const parse = (phone: string, defaultCountry?: CountryCode) => {
  const parsed = parsePhoneNumberFromString(phone, defaultCountry)
  if (!parsed?.isValid()) return null
  return {
    e164: parsed.format("E.164"),        // +14155551234
    national: parsed.format("NATIONAL"), // (415) 555-1234
    international: parsed.format("INTERNATIONAL"), // +1 415 555-1234
    countryCode: parsed.countryCallingCode,
    country: parsed.country ?? null,
    type: parsed.getType() ?? null,      // MOBILE | FIXED_LINE | etc.
  }
}

/** All supported country codes (for UI pickers). */
export const supportedCountries = (): CountryCode[] => getCountries()

// ── Effect Schema validators ──────────────────────────────────────────────────

/**
 * Schema check: validates that a string is a valid international phone number.
 *
 * Usage:
 *   const PhoneField = Schema.String.check(phoneNumberCheck)
 */
export const phoneNumberCheck = Schema.check<string>((s, ast, ctx) => {
  if (!isValid(s)) {
    return ctx.fail(ast, s, "Invalid phone number. Use E.164 format (e.g. +14155551234)")
  }
  return ctx.succeed(s)
})

/**
 * Full phone number Schema — validates AND normalizes to E.164 format.
 *
 * Usage:
 *   const PhoneField = E164PhoneNumber
 *   // "+1 415 555 1234" → "+14155551234"
 */
export const E164PhoneNumber = Schema.String.pipe(
  Schema.transformOrFail(
    Schema.String,
    {
      decode: (s, _, ast) => {
        const parsed = parse(s)
        if (!parsed) {
          return Schema.ParseResult.fail(
            new Schema.ParseResult.Type(ast, s, "Invalid phone number")
          )
        }
        return Schema.ParseResult.succeed(parsed.e164)
      },
      encode: Schema.ParseResult.succeed,
    }
  )
)
