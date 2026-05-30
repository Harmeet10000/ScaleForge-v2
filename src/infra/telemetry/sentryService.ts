import { Context, Effect, Layer } from "effect"
import * as Sentry from "@sentry/node"
import { AppConfig } from "../../core/config/configService.ts"

export interface SentryService {
  readonly captureException: (error: unknown, context?: Record<string, unknown>) => void
  readonly captureMessage: (message: string, level?: "info" | "warning" | "error") => void
}

export const SentryService = Context.Service<SentryService>("@infra/SentryService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  if (config.isProduction) {
    Sentry.init({
      dsn: process.env["SENTRY_DSN"],
      environment: config.nodeEnv,
      release: process.env["GIT_SHA"],
      tracesSampleRate: 0.1,
      // Ignore noisy non-errors
      ignoreErrors: ["Not found", "Unauthorized"],
    })
  }

  return SentryService.of({
    captureException: (error, context) => {
      if (!config.isProduction) return
      Sentry.withScope((scope) => {
        if (context != null) scope.setExtras(context)
        Sentry.captureException(error)
      })
    },
    captureMessage: (message, level = "info") => {
      if (!config.isProduction) return
      Sentry.captureMessage(message, level)
    },
  })
})

export const SentryServiceLive = Layer.effect(SentryService, make)
