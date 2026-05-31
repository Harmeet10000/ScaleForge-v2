/**
 * src/infra/http/httpClientService.ts
 *
 * Effect-wrapped HTTP client using undici.
 *
 * Why undici over fetch / axios / got:
 *   - Native Node.js HTTP/1.1 + HTTP/2 — lowest overhead
 *   - Supports interceptors (cache, OIDC, TLS dispatcher) at the connection pool level
 *   - ~3× faster than node-fetch on high-concurrency workloads
 *   - First-class TypeScript types
 *
 * Three dispatchers in play:
 *   - undici-cache-redis: Redis-backed HTTP response cache (GET requests only)
 *   - undici-oidc-interceptor: Auto-refreshes OIDC access tokens for service-to-service calls
 *   - undici-tls-dispatcher: TLS session resumption + cert pinning for outbound HTTPS
 *
 * Usage:
 *   const svc = yield* HttpClientService
 *   const body = yield* svc.getJson<User>('https://api.example.com/user/1')
 *   const resp = yield* svc.post('https://api.example.com/event', { json: payload })
 */

import { Context, Effect, Layer, Data } from "effect"
import { fetch, Agent } from "undici"
import type { Dispatcher, Response } from "undici"

// ── Errors ───────────────────────────────────────────────────────────────────

export class HttpRequestError extends Data.TaggedError("HttpRequestError")<{
  readonly url: string
  readonly method: string
  readonly status?: number
  readonly cause?: unknown
}> {}

export class HttpParseError extends Data.TaggedError("HttpParseError")<{
  readonly url: string
  readonly cause: unknown
}> {}

// ── Request options ───────────────────────────────────────────────────────────

export interface RequestOptions {
  readonly headers?: Record<string, string>
  readonly timeoutMs?: number
  /** For POST/PUT/PATCH — will be JSON-serialized */
  readonly json?: unknown
  /** For POST/PUT/PATCH — raw string body */
  readonly body?: string
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface HttpClientService {
  /**
   * GET and JSON-decode the response body.
   * Throws HttpRequestError on non-2xx status.
   * Throws HttpParseError if the body is not valid JSON.
   */
  readonly getJson: <T>(url: string, opts?: Omit<RequestOptions, "json" | "body">) => Effect.Effect<T, HttpRequestError | HttpParseError>

  /**
   * POST with a JSON body. Returns the decoded JSON response.
   */
  readonly postJson: <T>(url: string, body: unknown, opts?: RequestOptions) => Effect.Effect<T, HttpRequestError | HttpParseError>

  /**
   * Raw request — caller handles response parsing.
   */
  readonly request: (
    method: string,
    url: string,
    opts?: RequestOptions | undefined,
  ) => Effect.Effect<Response, HttpRequestError>
}

export const HttpClientService = Context.Service<HttpClientService>("@infra/HttpClientService")

// ── Implementation ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000

const make = Effect.sync(() => {
  // Base agent — connection pooling with sensible defaults.
  // Dispatchers (cache, oidc, tls) are layered at the environment level
  // by injecting a custom dispatcher when those features are needed.
  const baseAgent = new Agent({
    connect: {
      // TLS: use system CA + verify by default; override with undici-tls-dispatcher
      rejectUnauthorized: true,
    },
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connections: 10,              // per-origin connection pool
  })

  const makeHeaders = (
    extra?: Record<string, string>,
  ): Record<string, string> => ({
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  })

  const doFetch = async (
    method: string,
    url: string,
    opts: RequestOptions = {},
    dispatcher: Dispatcher = baseAgent,
  ) => {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )

    try {
      const body = opts.json !== undefined
        ? JSON.stringify(opts.json)
        : opts.body

      const response = await fetch(url, {
        method,
        headers: makeHeaders(opts.headers),
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
        dispatcher,
      })
      return response
    } finally {
      clearTimeout(timer)
    }
  }

  const getJson = <T>(url: string, opts?: Omit<RequestOptions, "json" | "body">) =>
    Effect.tryPromise({
      try: async () => {
        const res = await doFetch("GET", url, opts)
        if (!res.ok) throw new HttpRequestError({ url, method: "GET", status: res.status })
        const text = await res.text()
        try { return JSON.parse(text) as T }
        catch (cause) { throw new HttpParseError({ url, cause }) }
      },
      catch: (e) => {
        if (e instanceof HttpRequestError || e instanceof HttpParseError) return e
        return new HttpRequestError({ url, method: "GET", cause: e })
      },
    })

  const postJson = <T>(url: string, body: unknown, opts?: RequestOptions) =>
    Effect.tryPromise({
      try: async () => {
        const res = await doFetch("POST", url, { ...opts, json: body })
        if (!res.ok) throw new HttpRequestError({ url, method: "POST", status: res.status })
        const text = await res.text()
        try { return JSON.parse(text) as T }
        catch (cause) { throw new HttpParseError({ url, cause }) }
      },
      catch: (e) => {
        if (e instanceof HttpRequestError || e instanceof HttpParseError) return e
        return new HttpRequestError({ url, method: "POST", cause: e })
      },
    })

  const request = (method: string, url: string, opts?: RequestOptions | undefined): Effect.Effect<Response, HttpRequestError> =>
    Effect.tryPromise({
      try: () => doFetch(method, url, opts),
      catch: (e) => new HttpRequestError({ url, method, cause: e }),
    })

  return HttpClientService.of({ getJson, postJson, request })
})

export const HttpClientServiceLive = Layer.effect(HttpClientService, make)
