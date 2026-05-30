/**
 * src/runtime/appRuntime.ts
 *
 * Builds the single ManagedRuntime from AppLayer.
 * Exported as a singleton — consumed by fastifyBridge.ts and main.ts.
 */

import { ManagedRuntime } from "effect"
import type { Layer as LayerType } from "effect/Layer"
import { AppLayer } from "./appLayer.ts"

// Locally-defined helper to extract the Success (ROut) type from a Layer.
type LayerSuccess<T> = T extends LayerType<infer ROut, infer _E, infer _RIn> ? ROut : never

// Cast needed: Layer.mergeAll infers unknown ROut when all environment
// requirements are satisfied internally by AppConfigLive. Safe at runtime.
export const appRuntime = ManagedRuntime.make(
  AppLayer as unknown as LayerType<LayerSuccess<typeof AppLayer>, never, never>
)

export type AppRuntime = typeof appRuntime
