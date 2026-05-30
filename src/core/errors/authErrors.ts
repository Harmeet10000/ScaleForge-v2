import { Data } from "effect"

export class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  readonly identifier: string
}> {}

export class UserAlreadyExistsError extends Data.TaggedError("UserAlreadyExistsError")<{
  readonly email: string
}> {}

export class InvalidCredentialsError extends Data.TaggedError("InvalidCredentialsError")<{}> {}

export class AccountNotConfirmedError extends Data.TaggedError("AccountNotConfirmedError")<{
  readonly email: string
}> {}

export class AccountAlreadyConfirmedError extends Data.TaggedError("AccountAlreadyConfirmedError")<{
  readonly email: string
}> {}

export class InvalidConfirmationCodeError extends Data.TaggedError("InvalidConfirmationCodeError")<{}> {}

export class InvalidPhoneNumberError extends Data.TaggedError("InvalidPhoneNumberError")<{
  readonly phoneNumber: string
}> {}

export class InvalidTimezoneError extends Data.TaggedError("InvalidTimezoneError")<{
  readonly isoCode: string
}> {}

export class PasswordResetExpiredError extends Data.TaggedError("PasswordResetExpiredError")<{}> {}

export class PasswordSameAsOldError extends Data.TaggedError("PasswordSameAsOldError")<{}> {}

export class InvalidOldPasswordError extends Data.TaggedError("InvalidOldPasswordError")<{}> {}

export class InvalidTokenError extends Data.TaggedError("InvalidTokenError")<{
  readonly reason: string
}> {}

export class TokenExpiredError extends Data.TaggedError("TokenExpiredError")<{
  readonly tokenType: "access" | "refresh"
}> {}

export class InvalidOAuthCredentialsError extends Data.TaggedError("InvalidOAuthCredentialsError")<{
  readonly provider: string
}> {}
