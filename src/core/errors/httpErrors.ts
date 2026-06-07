import { match } from "ts-pattern"
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
  TokenExpiredError,
  ApiKeyNotFoundError,
  ApiKeyExpiredError,
  ApiKeyRevokedError,
  ApiKeyInvalidError,
} from "./authErrors.ts"
import type { HealthCheckError } from "./infraErrors.ts"
import type {
  SearchDocumentNotFoundError,
  SearchQueryTooLongError,
  SearchTenantRequiredError,
  SearchJobNotFoundError,
} from "../../app/features/search/searchErrors.ts"

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
  | TokenExpiredError
  | InvalidOAuthCredentialsError
  | HealthCheckError
  | TooManyRequestsError
  | ApiKeyNotFoundError
  | ApiKeyExpiredError
  | ApiKeyRevokedError
  | ApiKeyInvalidError
  | SearchDocumentNotFoundError
  | SearchQueryTooLongError
  | SearchTenantRequiredError
  | SearchJobNotFoundError

const httpError = (statusCode: number, message: string): HttpErrorResponse => ({
  success: false,
  statusCode,
  message,
  data: null,
})

// ts-pattern .exhaustive() compile-fails on missing cases.
// Note: Effect Match.pipe has a 20-arg overload limit — at 22 cases + Match.exhaustive
// we exceed that limit, hence ts-pattern here.
export const toHttpError = (error: AppError): HttpErrorResponse =>
  match(error)
    // ── Common errors ─────────────────────────────────────────────────────────
    .with({ _tag: "NotFoundError" }, (e) =>
      httpError(404, `${e.resource} not found${e.identifier != null ? `: ${e.identifier}` : ""}`)
    )
    .with({ _tag: "ValidationError" }, (e) =>
      httpError(400, `Validation failed: ${e.field} - ${e.message}`)
    )
    .with({ _tag: "UnauthorizedError" }, (e) => httpError(401, e.reason ?? "Unauthorized"))
    .with({ _tag: "ForbiddenError" }, (e) => httpError(403, e.reason ?? "Forbidden"))
    .with({ _tag: "ConflictError" }, (e) =>
      httpError(409, `${e.resource} already exists: ${e.identifier}`)
    )
    .with({ _tag: "ExternalServiceError" }, (e) =>
      httpError(502, `External service error: ${e.service}`)
    )
    .with({ _tag: "TooManyRequestsError" }, (e) =>
      httpError(429, e.retryAfter != null ? `Rate limit exceeded. Retry after ${e.retryAfter}` : "Rate limit exceeded")
    )
    // ── Auth errors ───────────────────────────────────────────────────────────
    .with({ _tag: "UserNotFoundError" }, (e) => httpError(404, `User not found: ${e.identifier}`))
    .with({ _tag: "UserAlreadyExistsError" }, (e) =>
      httpError(409, `User already exists: ${e.email}`)
    )
    .with({ _tag: "InvalidCredentialsError" }, () => httpError(401, "Invalid credentials"))
    .with({ _tag: "AccountNotConfirmedError" }, (e) =>
      httpError(403, `Account not confirmed: ${e.email}`)
    )
    .with({ _tag: "AccountAlreadyConfirmedError" }, (e) =>
      httpError(409, `Account already confirmed: ${e.email}`)
    )
    .with({ _tag: "InvalidConfirmationCodeError" }, () => httpError(400, "Invalid confirmation code"))
    .with({ _tag: "InvalidPhoneNumberError" }, (e) =>
      httpError(400, `Invalid phone number: ${e.phoneNumber}`)
    )
    .with({ _tag: "InvalidTimezoneError" }, (e) =>
      httpError(400, `Invalid timezone for ISO code: ${e.isoCode}`)
    )
    .with({ _tag: "PasswordResetExpiredError" }, () =>
      httpError(410, "Password reset link has expired")
    )
    .with({ _tag: "PasswordSameAsOldError" }, () =>
      httpError(400, "New password must be different from old password")
    )
    .with({ _tag: "InvalidOldPasswordError" }, () => httpError(401, "Invalid old password"))
    .with({ _tag: "InvalidTokenError" }, (e) => httpError(401, `Invalid token: ${e.reason}`))
    .with({ _tag: "TokenExpiredError" }, (e) => httpError(401, `${e.tokenType} token has expired`))
    .with({ _tag: "InvalidOAuthCredentialsError" }, (e) =>
      httpError(401, `Invalid OAuth credentials: ${e.provider}`)
    )
    // ── Infra errors surfaced to HTTP ──────────────────────────────────────────
    .with({ _tag: "HealthCheckError" }, (e) =>
      httpError(503, `Health check failed: ${e.component}`)
    )
    // ── API key errors ────────────────────────────────────────────────────────
    .with({ _tag: "ApiKeyNotFoundError" }, () => httpError(401, "Invalid API key"))
    .with({ _tag: "ApiKeyExpiredError" }, () => httpError(401, "API key has expired"))
    .with({ _tag: "ApiKeyRevokedError" }, () => httpError(401, "API key has been revoked"))
    .with({ _tag: "ApiKeyInvalidError" }, (e) => httpError(401, `Invalid API key: ${e.reason}`))
    // ── Search errors ─────────────────────────────────────────────────────────
    .with({ _tag: "SearchDocumentNotFoundError" }, (e) =>
      httpError(404, `Search document not found: ${e.documentId}`)
    )
    .with({ _tag: "SearchQueryTooLongError" }, (e) =>
      httpError(400, `Search query too long: ${e.length} chars (max ${e.maxLength})`)
    )
    .with({ _tag: "SearchTenantRequiredError" }, () =>
      httpError(400, "tenantId is required for search")
    )
    .with({ _tag: "SearchJobNotFoundError" }, (e) =>
      httpError(404, `Search job not found: ${e.jobId}`)
    )
    .exhaustive()
