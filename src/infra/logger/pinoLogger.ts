/**
 * src/infra/logger/pinoLogger.ts
 *
 * Pino-backed Effect logger.
 * Reads LOG_LEVEL + NODE_ENV directly from process.env — no AppConfig
 * dependency so it can be composed without a config layer.
 *
 * Effect v4: Logger.layer([logger]) replaces all loggers.
 * logLevel in the callback is a plain string tag: "Fatal"|"Error"|"Warning"|...
 */

import { Cause, Layer, Logger } from "effect"
import pino from "pino"

// Map Effect LogLevel string tags → pino levels
// pino.Level type doesn't include "silent" but it's valid at runtime — cast.
const pinoLevelMap: Record<string, string> = {
  Fatal: "fatal",
  Error: "error",
  Warning: "warn",
  Info: "info",
  Debug: "debug",
  Trace: "trace",
  All: "trace",
  None: "silent",
}

// Eagerly build the pino instance from env — cheap and always available.
const pinoInstance = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  ...(process.env["NODE_ENV"] !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
})

const pinoEffectLogger = Logger.make(({ logLevel, message, cause }) => {
  const level = (pinoLevelMap[logLevel as string] ?? "info") as pino.Level
  const msg = Array.isArray(message) ? message.join(" ") : String(message)
  const meta: Record<string, unknown> = {}
  // Include cause only when it is non-trivial
  const c = cause as Cause.Cause<unknown>
  if (c !== undefined) {
    const prettyMsg = Cause.pretty(c)
    if (prettyMsg && prettyMsg.length > 0) {
      meta["cause"] = prettyMsg
    }
  }
  // pino logs are dispatched via the level method; "silent" suppresses all output
  const logFn = pinoInstance[level] ?? pinoInstance.info
  logFn.call(pinoInstance, meta, msg)
})

// Logger.layer([...]) replaces all current loggers with the given set.
export const PinoLoggerLayer: Layer.Layer<never> = Logger.layer([pinoEffectLogger])
