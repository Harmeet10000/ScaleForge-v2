/**
 * src/runtime/requestContext.ts
 *
 * Context.Reference values for per-request ambient data.
 *
 * These have default values so services can yield them without
 * adding requirements to the R channel (R stays `never`).
 *
 * `effectHandler` in fastifyBridge.ts provides real values per-request.
 * Services accessed outside a request (workers, tests) receive the defaults.
 *
 * Usage in any Effect.gen:
 *   const userId = yield* CurrentUserId    // string | null
 *   const reqId  = yield* RequestId        // string
 *   const ip     = yield* CurrentUserIp    // string
 */

import { Context } from "effect"

/** Fastify request ID (UUID or sequential counter per Fastify config). */
export const RequestId = Context.Reference<string>(
  "@request/RequestId",
  { defaultValue: () => "unknown" },
)

/**
 * Authenticated user ID from the PASETO access token.
 * null when the route has no requireAuth preHandler.
 */
export const CurrentUserId = Context.Reference<string | null>(
  "@request/CurrentUserId",
  { defaultValue: () => null },
)

/** Client IP from req.ip (behind proxy: rightmost X-Forwarded-For hop). */
export const CurrentUserIp = Context.Reference<string>(
  "@request/CurrentUserIp",
  { defaultValue: () => "0.0.0.0" },
)
