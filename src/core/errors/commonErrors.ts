import { Data } from "effect"

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string
  readonly identifier?: string
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly field: string
  readonly message: string
}> {}

export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly reason?: string
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly reason?: string
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly resource: string
  readonly identifier: string
}> {}

export class ExternalServiceError extends Data.TaggedError("ExternalServiceError")<{
  readonly service: string
  readonly cause: unknown
}> {}

export class TooManyRequestsError extends Data.TaggedError("TooManyRequestsError")<{
  readonly retryAfter?: string
}> {}
