import { Schema } from "effect"

// Standard API response envelope
export const ApiResponse = Schema.Struct({
  success: Schema.Boolean,
  statusCode: Schema.Number,
  message: Schema.String,
  data: Schema.Unknown,
})
export type ApiResponse = Schema.Schema.Type<typeof ApiResponse>

// Pagination query params — defaults (1 / 20) handled at call sites with `?? 1`
export const PaginationParams = Schema.Struct({
  page: Schema.optionalKey(Schema.NumberFromString),
  limit: Schema.optionalKey(Schema.NumberFromString),
})
export type PaginationParams = Schema.Schema.Type<typeof PaginationParams>

// Common field schemas
export const EmailSchema = Schema.String.check(
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
)

export const PasswordSchema = Schema.String.check(
  Schema.isMinLength(8)
)

export const UUIDSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
)
