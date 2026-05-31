/**
 * src/core/validators/timezone.ts
 *
 * Timezone and country validation using countries-and-timezones.
 *
 * Used in:
 *   - User profile update Schema (Phase 7)
 *   - Webhook scheduling (per-user timezone for "business hours" delivery)
 *
 * Effect Schema integration:
 *   Schema.String.check(timezoneCheck)
 */

import * as ct from "countries-and-timezones"
import { Schema } from "effect"

// ── Raw helpers ───────────────────────────────────────────────────────────────

/** All valid IANA timezone identifiers (e.g. "America/New_York", "Europe/London"). */
export const allTimezones = (): string[] =>
  Object.keys(ct.getAllTimezones())

/** All valid ISO 3166-1 alpha-2 country codes (e.g. "US", "IN", "GB"). */
export const allCountryCodes = (): string[] =>
  Object.keys(ct.getAllCountries())

/** Returns true if the string is a valid IANA timezone. */
export const isValidTimezone = (tz: string): boolean =>
  ct.getTimezone(tz) !== null

/** Returns true if the string is a valid ISO country code. */
export const isValidCountryCode = (code: string): boolean =>
  ct.getCountry(code) !== null

/** Get all timezones for a country code. */
export const timezonesForCountry = (code: string): string[] => {
  const country = ct.getCountry(code)
  return country?.timezones ?? []
}

/** Get the country for a timezone. */
export const countryForTimezone = (tz: string): string | null => {
  const timezone = ct.getTimezone(tz)
  return timezone?.countries[0] ?? null
}

/**
 * UTC offset for a timezone in minutes.
 * Accounts for DST based on the current time.
 */
export const utcOffsetMinutes = (tz: string): number | null => {
  const timezone = ct.getTimezone(tz)
  return timezone?.utcOffset ?? null
}

// ── Effect Schema validators ──────────────────────────────────────────────────

/**
 * Schema check: validates that a string is a valid IANA timezone.
 *
 * Usage:
 *   const TimezoneField = Schema.String.check(timezoneCheck)
 */
export const timezoneCheck = Schema.makeFilter(
  (s: string) =>
    isValidTimezone(s) ||
    `Invalid timezone: "${s}". Use an IANA timezone identifier (e.g. "America/New_York")`,
)

/**
 * Schema check: validates that a string is a valid ISO 3166-1 alpha-2 country code.
 * Note: normalizes to uppercase before validation; the decoded value is uppercase.
 *
 * Usage:
 *   const CountryField = Schema.String.check(countryCodeCheck)
 */
export const countryCodeCheck = Schema.makeFilter(
  (s: string) =>
    isValidCountryCode(s.toUpperCase()) ||
    `Invalid country code: "${s}". Use ISO 3166-1 alpha-2 (e.g. "US", "IN")`,
)

/** Branded Schema type for valid IANA timezones */
export const IanaTimezone = Schema.String.check(timezoneCheck)

/** Branded Schema type for valid ISO country codes */
export const Iso2CountryCode = Schema.String.check(countryCodeCheck)
