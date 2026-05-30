import { Context, Effect, Layer, Redacted } from "effect"
import { Resend } from "resend"
import { AppConfig } from "../../core/config/configService.ts"
import { EmailSendError } from "../../core/errors/infraErrors.ts"

export interface EmailSendParams {
  readonly to: readonly string[]
  readonly subject: string
  readonly html: string
  readonly from?: string
}

export interface EmailService {
  readonly send: (params: EmailSendParams) => Effect.Effect<void, EmailSendError>
}

export const EmailService = Context.Service<EmailService>("@infra/EmailService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig
  const resend = new Resend(Redacted.value(config.email.resendKey))

  return EmailService.of({
    send: (params) =>
      Effect.tryPromise({
        try: () =>
          resend.emails.send({
            from: params.from ?? "noreply@scaleforge.dev",
            to: [...params.to],
            subject: params.subject,
            html: params.html,
          }),
        catch: (error) =>
          new EmailSendError({ to: params.to, subject: params.subject, cause: error }),
      }).pipe(Effect.asVoid),
  })
})

export const EmailServiceLive = Layer.effect(EmailService, make)
