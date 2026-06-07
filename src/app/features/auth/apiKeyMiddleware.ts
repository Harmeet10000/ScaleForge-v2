/**
 * src/app/features/auth/apiKeyMiddleware.ts
 *
 * Fastify `preHandler` that authenticates requests using API keys.
 *
 * Supported header formats:
 *   Authorization: Bearer sk_live_<hex>   (standard Bearer — detected by sk_ prefix)
 *   X-Api-Key: sk_live_<hex>              (explicit API key header)
 *
 * On success: sets `request.user` with a synthetic AccessTokenPayload-compatible
 * object so all downstream handlers work without modification.
 *
 * @fastify/auth integration:
 *   app.register(fastifyAuth)
 *   route.addHook('preHandler', app.auth([requireAuth, requireApiKey]))
 *   // → tries requireAuth first; on failure tries requireApiKey
 */

import type { FastifyRequest, FastifyReply } from "fastify"
import { Effect, Cause, Result } from "effect"
import { ApiKeyService } from "./apiKeyService.ts"
import { toHttpError } from "../../../core/errors/httpErrors.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"
import type { AccessTokenPayload } from "./tokenService.ts"

// ── Type augmentation ─────────────────────────────────────────────────────────

// Extend the existing request.user to optionally carry apiKeyId.
// authMiddleware.ts already declared `user?: AccessTokenPayload`; we extend it
// by intersection so both sources are compatible with the same field.
declare module "fastify" {
  interface FastifyRequest {
    apiKeyId?: string   // set when request was authenticated via API key
  }
}

// ── Detector ─────────────────────────────────────────────────────────────────

const API_KEY_PREFIX_RE = /^sk_(?:live|test)_/

/** Returns the raw API key from the request if present, else null. */
const extractApiKey = (request: FastifyRequest): string | null => {
  // 1. X-Api-Key header (explicit, preferred for programmatic clients)
  const xApiKey = request.headers["x-api-key"]
  if (typeof xApiKey === "string" && API_KEY_PREFIX_RE.test(xApiKey)) {
    return xApiKey
  }

  // 2. Authorization: Bearer sk_live_... (detected by sk_ prefix)
  const auth = request.headers.authorization
  if (typeof auth === "string" && auth.startsWith("Bearer sk_")) {
    return auth.slice(7)
  }

  return null
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Fastify preHandler: authenticate via API key.
 *
 * Usage (standalone):
 *   fastify.addHook('preHandler', requireApiKey)
 *
 * Usage (with @fastify/auth multi-strategy):
 *   fastify.route({
 *     preHandler: fastify.auth([requireAuth, requireApiKey], { relation: 'or' })
 *   })
 */
export const requireApiKey = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const rawKey = extractApiKey(request)

  if (!rawKey) {
    await reply.status(401).send({
      success: false,
      statusCode: 401,
      message: "Missing API key. Provide X-Api-Key header or Bearer sk_... token.",
      data: null,
    })
    return
  }

  const exit = await request.server.effectRuntime.runPromiseExit(
    Effect.flatMap(ApiKeyService, (s) => s.verify(rawKey))
  )

  if (exit._tag === "Success") {
    const verified = exit.value

    // Set request.user with PASETO-compatible synthetic payload so all
    // downstream handlers that check request.user.sub work unchanged.
    request.user = {
      sub: verified.userId,
      role: "api_key",   // role marker for authorization checks
      jti: verified.keyId,
    } satisfies AccessTokenPayload

    request.apiKeyId = verified.keyId
    return
  }

  const errorResult = Cause.findError(exit.cause)
  if (Result.isSuccess(errorResult)) {
    const http = toHttpError(errorResult.success as AppError)
    await reply.status(http.statusCode).send(http)
  } else {
    await reply.status(401).send({
      success: false,
      statusCode: 401,
      message: "Invalid API key",
      data: null,
    })
  }
}
