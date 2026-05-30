/**
 * src/app/features/auth2/authMiddleware.ts
 *
 * Fastify `preHandler` hook that verifies the Bearer PASETO token
 * and attaches the decoded payload to `request.user`.
 */

import type { FastifyRequest, FastifyReply } from "fastify"
import { Effect, Cause, Result } from "effect"
import { TokenService } from "./tokenService.ts"
import type { AccessTokenPayload } from "./tokenService.ts"
import { toHttpError } from "../../../core/errors/httpErrors.ts"
import type { AppError } from "../../../core/errors/httpErrors.ts"

// Declaration merging — teach TypeScript that request.user exists.
declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload
  }
}

export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    await reply.status(401).send({ success: false, statusCode: 401, message: "Missing Authorization header", data: null })
    return
  }

  const token = authHeader.slice(7)
  const exit = await request.server.effectRuntime.runPromiseExit(
    Effect.flatMap(TokenService, (s) => s.verifyAccess(token))
  )

  if (exit._tag === "Success") {
    request.user = exit.value
    return
  }

  const errorResult = Cause.findError(exit.cause)
  if (Result.isSuccess(errorResult)) {
    const http = toHttpError(errorResult.success as AppError)
    await reply.status(http.statusCode).send(http)
  } else {
    await reply.status(401).send({ success: false, statusCode: 401, message: "Unauthorized", data: null })
  }
}
