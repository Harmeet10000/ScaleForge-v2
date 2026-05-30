import { Schema } from "effect"

// Standard API response envelope
export const ApiResponse = Schema.Struct({
  success: Schema.Boolean,
  statusCode: Schema.Number,
  message: Schema.String,
  data: Schema.Unknown,
})
export type ApiResponse = Schema.Schema.Type<typeof ApiResponse>

// Pagination query params
export const PaginationParams = Schema.Struct({
  page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 }),
  limit: Schema.optionalWith(Schema.NumberFromString, { default: () => 20 }),
})
export type PaginationParams = Schema.Schema.Type<typeof PaginationParams>

// Common field schemas
export const EmailSchema = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => "Invalid email format",
  })
)

export const PasswordSchema = Schema.String.pipe(
  Schema.minLength(8, { message: () => "Password must be at least 8 characters" })
)

export const UUIDSchema = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
)
