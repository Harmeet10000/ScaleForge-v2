import { Match } from "effect"
import type {
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ExternalServiceError,
  TooManyRequestsError,
} from "./commonErrors.ts"
import type {
  UserNotFoundError,
  UserAlreadyExistsError,
  InvalidCredentialsError,
  AccountNotConfirmedError,
  AccountAlreadyConfirmedError,
  InvalidConfirmationCodeError,
  InvalidPhoneNumberError,
  InvalidTimezoneError,
  PasswordResetExpiredError,
  PasswordSameAsOldError,
  InvalidOldPasswordError,
  InvalidTokenError,
  InvalidOAuthCredentialsError,
} from "./authErrors.ts"
import type { HealthCheckError } from "./infraErrors.ts"

export interface HttpErrorResponse {
  readonly success: false
  readonly statusCode: number
  readonly message: string
  readonly data: null
}

// Union of all errors that can be mapped to HTTP responses.
// HealthCheckError is included per plan-review fix (was missing in initial draft).
export type AppError =
  | NotFoundError
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | ConflictError
  | ExternalServiceError
  | UserNotFoundError
  | UserAlreadyExistsError
  | InvalidCredentialsError
  | AccountNotConfirmedError
  | AccountAlreadyConfirmedError
  | InvalidConfirmationCodeError
  | InvalidPhoneNumberError
  | InvalidTimezoneError
  | PasswordResetExpiredError
  | PasswordSameAsOldError
  | InvalidOldPasswordError
  | InvalidTokenError
  | InvalidOAuthCredentialsError
  | HealthCheckError
  | TooManyRequestsError

const httpError = (statusCode: number, message: string): HttpErrorResponse => ({
  success: false,
  statusCode,
  message,
  data: null,
})

export const toHttpError = (error: AppError): HttpErrorResponse =>
  Match.value(error).pipe(
    // Common errors
    Match.tag("NotFoundError", (e) =>
      httpError(404, `${e.resource} not found${e.identifier != null ? `: ${e.identifier}` : ""}`)
    ),
    Match.tag("ValidationError", (e) =>
      httpError(400, `Validation failed: ${e.field} - ${e.message}`)
    ),
    Match.tag("UnauthorizedError", (e) => httpError(401, e.reason ?? "Unauthorized")),
    Match.tag("ForbiddenError", (e) => httpError(403, e.reason ?? "Forbidden")),
    Match.tag("ConflictError", (e) =>
      httpError(409, `${e.resource} already exists: ${e.identifier}`)
    ),
    Match.tag("ExternalServiceError", (e) =>
      httpError(502, `External service error: ${e.service}`)
    ),
    // Auth errors
    Match.tag("UserNotFoundError", (e) => httpError(404, `User not found: ${e.identifier}`)),
    Match.tag("UserAlreadyExistsError", (e) =>
      httpError(409, `User already exists: ${e.email}`)
    ),
    Match.tag("InvalidCredentialsError", () => httpError(401, "Invalid credentials")),
    Match.tag("AccountNotConfirmedError", (e) =>
      httpError(403, `Account not confirmed: ${e.email}`)
    ),
    Match.tag("AccountAlreadyConfirmedError", (e) =>
      httpError(409, `Account already confirmed: ${e.email}`)
    ),
    Match.tag("InvalidConfirmationCodeError", () => httpError(400, "Invalid confirmation code")),
    Match.tag("InvalidPhoneNumberError", (e) =>
      httpError(400, `Invalid phone number: ${e.phoneNumber}`)
    ),
    Match.tag("InvalidTimezoneError", (e) =>
      httpError(400, `Invalid timezone for ISO code: ${e.isoCode}`)
    ),
    Match.tag("PasswordResetExpiredError", () =>
      httpError(410, "Password reset link has expired")
    ),
    Match.tag("PasswordSameAsOldError", () =>
      httpError(400, "New password must be different from old password")
    ),
    Match.tag("InvalidOldPasswordError", () => httpError(401, "Invalid old password")),
    Match.tag("InvalidTokenError", (e) => httpError(401, `Invalid token: ${e.reason}`)),
    Match.tag("InvalidOAuthCredentialsError", (e) =>
      httpError(401, `Invalid OAuth credentials: ${e.provider}`)
    ),
    // Infra errors surfaced to HTTP
    Match.tag("HealthCheckError", (e) =>
      httpError(503, `Health check failed: ${e.component}`)
    ),
    Match.tag("TooManyRequestsError", (e) =>
      httpError(429, e.retryAfter != null ? `Rate limit exceeded. Retry after ${e.retryAfter}` : "Rate limit exceeded")
    ),
    Match.exhaustive
  )
