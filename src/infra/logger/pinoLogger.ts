import { Logger } from "effect"
import pino from "pino"
import { AppConfig } from "../../core/config/configService.ts"
import { Effect, Layer } from "effect"

// Build the Pino instance from config so log level and transport are config-driven.
// This is the only place in the codebase that imports Pino directly.
// Features use Effect.log* exclusively.
const makePinoInstance = Effect.gen(function* () {
  const config = yield* AppConfig
  return pino({
    level: config.logLevel,
    transport:
      config.isDevelopment
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
        : undefined,
  })
})

export const PinoLoggerLayer = Layer.effect(
  Logger.defaultLogger,
  Effect.gen(function* () {
    const pinoInstance = yield* makePinoInstance
    return Logger.make(({ logLevel, message, annotations, cause }) => {
      const level = logLevel.label.toLowerCase() as pino.Level
      const msg = Array.isArray(message) ? message.join(" ") : String(message)
      const meta: Record<string, unknown> = Object.fromEntries(annotations)
      if (cause !== undefined) meta["cause"] = cause
      const log = pinoInstance[level] ?? pinoInstance.info
      log.call(pinoInstance, meta, msg)
    })
  })
)
