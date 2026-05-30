import { Context, Effect, Layer } from "effect"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { AppConfig } from "../../core/config/configService.ts"

export interface TracingService {
  readonly sdk: NodeSDK
}

export const TracingService = Context.Service<TracingService>("@infra/TracingService")

const make = Effect.gen(function* () {
  const config = yield* AppConfig

  const sdk = new NodeSDK({
    serviceName: `scaleforge-${config.nodeEnv}`,
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations({
      // Disable noisy instrumentations in dev
      "@opentelemetry/instrumentation-fs": { enabled: false },
    })],
  })

  yield* Effect.acquireRelease(
    Effect.sync(() => sdk.start()),
    () => Effect.promise(() => sdk.shutdown().catch(() => void 0))
  )

  return TracingService.of({ sdk })
})

export const TracingServiceLive = Layer.effect(TracingService, make)
