/**
 * src/core/utils/dateUtils.ts
 *
 * Date formatting and manipulation utilities using date-fns v4.
 *
 * Why date-fns over dayjs / luxon:
 *   - ESM-native, tree-shakeable — only import what you use
 *   - No mutable state, no global locale — pure functions
 *   - Excellent TypeScript types
 *   - date-fns v4 is timezone-aware via date-fns-tz (add if needed)
 *
 * Conventions used in this project:
 *   - All dates stored in PostgreSQL as UTC
 *   - Display formatting is the UI's responsibility; server returns ISO strings
 *   - Use these helpers for business logic (rolling windows, expiry checks, etc.)
 */

import {
  format,
  parseISO,
  formatISO,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  subMinutes,
  subHours,
  subDays,
  subWeeks,
  subMonths,
  startOfDay,
  endOfDay,
  startOfHour,
  startOfWeek,
  startOfMonth,
  startOfYear,
  endOfMonth,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  isAfter,
  isBefore,
  isEqual,
  isValid,
  isPast,
  isFuture,
  formatDistanceToNow,
  formatDistance,
  formatDuration,
  intervalToDuration,
  getUnixTime,
  fromUnixTime,
} from "date-fns"

// ── Re-exports (use these, not date-fns directly) ─────────────────────────────
export {
  // Parsing
  parseISO,       // parseISO('2024-01-15T10:00:00Z') → Date
  // Formatting
  format,         // format(date, 'yyyy-MM-dd HH:mm:ss')
  formatISO,      // formatISO(date) → '2024-01-15T10:00:00Z'
  // Arithmetic
  addMinutes, addHours, addDays, addWeeks, addMonths,
  subMinutes, subHours, subDays, subWeeks, subMonths,
  // Boundaries
  startOfDay, endOfDay, startOfHour,
  startOfWeek, startOfMonth, startOfYear, endOfMonth,
  // Differences
  differenceInSeconds, differenceInMinutes, differenceInHours,
  differenceInDays, differenceInWeeks,
  // Comparisons
  isAfter, isBefore, isEqual, isValid, isPast, isFuture,
  // Human-readable
  formatDistanceToNow, formatDistance, formatDuration, intervalToDuration,
  // Unix timestamps
  getUnixTime, fromUnixTime,
}

// ── Leaderboard rolling windows ───────────────────────────────────────────────
// These are used by the leaderboard service to compute rolling window boundaries.

/** Start of the 24h rolling window from now */
export const rolling24hStart = (): Date => subHours(new Date(), 24)

/** Start of the 7d rolling window from now */
export const rolling7dStart = (): Date => subDays(new Date(), 7)

// ── Expiry helpers ────────────────────────────────────────────────────────────

/** Create an expiry Date N minutes from now */
export const expiresInMinutes = (n: number): Date => addMinutes(new Date(), n)

/** Create an expiry Date N hours from now */
export const expiresInHours = (n: number): Date => addHours(new Date(), n)

/** Create an expiry Date N days from now */
export const expiresInDays = (n: number): Date => addDays(new Date(), n)

/** Check if a Date is already past */
export const isExpired = (date: Date | string): boolean => {
  const d = typeof date === "string" ? parseISO(date) : date
  return isPast(d)
}

/** Seconds remaining until expiry (0 if already expired) */
export const secondsUntilExpiry = (expires: Date | string): number => {
  const d = typeof expires === "string" ? parseISO(expires) : expires
  return Math.max(0, differenceInSeconds(d, new Date()))
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** ISO 8601 UTC string — use for all API responses and DB inserts */
export const toISOString = (date: Date = new Date()): string =>
  date.toISOString()

/** Human-readable relative time: "3 minutes ago", "in 2 days" */
export const toRelative = (date: Date | string): string => {
  const d = typeof date === "string" ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

/** Duration between two dates as a human-readable string */
export const toDurationString = (start: Date, end: Date): string => {
  const duration = intervalToDuration({ start, end })
  return formatDuration(duration, { delimiter: ", " })
}

// ── PASETO / JWT token expiry ─────────────────────────────────────────────────
// Matches the token TTLs in tokenService.ts

export const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60       // 15 minutes
export const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60  // 7 days

export const accessTokenExpiresAt = (): Date => expiresInMinutes(15)
export const refreshTokenExpiresAt = (): Date => expiresInDays(7)
