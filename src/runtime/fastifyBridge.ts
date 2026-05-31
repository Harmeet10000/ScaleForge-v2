/**
 * src/runtime/fastifyBridge.ts
 *
 * Two responsibilities:
 *
 * 1. `fastifyBridgePlugin` — registers the ManagedRuntime as a Fastify
 *    decorator and wires per-request Context.Reference injection via onRequest.
 *
 * 2. `effectHandler` — the canonical way for route handlers to run an Effect
 *    and map the result to an HTTP response. Centralises error mapping so no
 *    route needs to duplicate Cause.findError + toHttpError logic.
 *
 * Context.Reference values (RequestId, CurrentUserId, CurrentUserIp) are
 * provided locally per request so any service in the call stack can yield
 * them without receiving them as function parameters.
 */

import fp from "fastify-plugin"
import { Cause, Effect, Result } from "effect"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { appRuntime } from "./appRuntime.ts"
import { RequestId, CurrentUserId, CurrentUserIp } from "./requestContext.ts"
import { toHttpError } from "../core/errors/httpErrors.ts"
import type { AppError } from "../core/errors/httpErrors.ts"

// ── TypeScript: teach Fastify about the effectRuntime decorator ───────────────
declare module "fastify" {
  interface FastifyInstance {
    effectRuntime: typeof appRuntime
  }
}

// ── effectHandler ─────────────────────────────────────────────────────────────

export interface EffectHandlerOptions<A> {
  /**
   * HTTP status code to send on success. Defaults to 200.
   */
  readonly statusCode?: number
  /**
   * Optional custom response writer.
   * Called instead of the default `{ success, statusCode, message, data }` envelope.
   * Use for routes that need to set cookies, stream, or send a non-standard shape.
   * Must call `reply.send(...)` itself.
   */
  readonly transform?: (
    value: A,
    reply: FastifyReply,
    req: FastifyRequest,
  ) => void | Promise<void>
}

/**
 * Run an Effect inside a Fastify route handler.
 *
 * - Provides RequestId, CurrentUserId, CurrentUserIp from the current request.
 * - On success: sends `{ success: true, statusCode, message: "OK", data: value }`.
 * - On typed AppError: maps via `toHttpError` and sends the HTTP error shape.
 * - On unhandled defect: logs the cause and sends 500.
 *
 * The `effect` type parameter uses `any` for R so callers can pass effects that
 * still have service requirements satisfied by appRuntime (e.g. AuthService).
 * The cast to `never` before `runPromiseExit` is safe: appRuntime provides all
 * registered services.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const effectHandler = async <A>(
  req: FastifyRequest,
  reply: FastifyReply,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect: Effect.Effect<A, AppError, any>,
  options?: EffectHandlerOptions<A>,
): Promise<void> => {
  // Extract user sub — req.user is injected by requireAuth preHandler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (req as unknown as { user?: { sub: string } }).user?.sub ?? null

  const scoped = (effect as Effect.Effect<A, AppError, never>).pipe(
    Effect.provideService(RequestId, req.id),
    Effect.provideService(CurrentUserId, userId),
    Effect.provideService(CurrentUserIp, req.ip),
  )

  const exit = await req.server.effectRuntime.runPromiseExit(scoped)

  if (exit._tag === "Success") {
    if (options?.transform) {
      await options.transform(exit.value, reply, req)
    } else {
      const code = options?.statusCode ?? 200
      void reply.status(code).send({
        success: true,
        statusCode: code,
        message: "OK",
        data: exit.value,
      })
    }
    return
  }

  const errResult = Cause.findError(exit.cause)
  if (Result.isSuccess(errResult)) {
    const http = toHttpError(errResult.success as AppError)
    void reply.status(http.statusCode).send(http)
    return
  }

  // Unhandled defect — log full cause for post-mortem, send safe 500
  req.log.error({ cause: Cause.pretty(exit.cause) }, "Unhandled Effect defect in effectHandler")
  void reply.status(500).send({
    success: false,
    statusCode: 500,
    message: "Internal server error",
    data: null,
  })
}

// ── Fastify plugin ─────────────────────────────────────────────────────────────

const fastifyBridgePlugin = fp(async (fastify: FastifyInstance) => {
  // 1. Expose the ManagedRuntime to all route handlers.
  fastify.decorate("effectRuntime", appRuntime)

  // 2. Dispose on server close (graceful shutdown of all Effect managed resources).
  fastify.addHook("onClose", async () => {
    await appRuntime.dispose()
  })
})

export default fastifyBridgePlugin
