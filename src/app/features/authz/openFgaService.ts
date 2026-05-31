/**
 * src/app/features/authz/openFgaService.ts
 *
 * Effect layer wrapping @openfga/sdk OpenFgaClient.
 * Provides check, batchCheck, writeTuples, deleteTuples, listObjects.
 *
 * Credentials are driven by OPENFGA_CREDENTIALS_METHOD env var:
 *   "none"               — no auth (self-hosted dev)
 *   "api_token"          — pre-shared key via OPENFGA_API_TOKEN
 *   "client_credentials" — OAuth2 via OPENFGA_CLIENT_ID / OPENFGA_CLIENT_SECRET
 *
 * Depends on: AppConfig
 */

import { Context, Effect, Layer, Redacted } from "effect"
import {
  OpenFgaClient,
  CredentialsMethod,
  ClientWriteRequestOnDuplicateWrites,
  ClientWriteRequestOnMissingDeletes,
  type ClientCheckRequest,
  type ClientBatchCheckRequest,
  type ClientBatchCheckItem,
  type ClientWriteRequest,
  type ClientListObjectsRequest,
} from "@openfga/sdk"
import { AppConfig } from "../../../core/config/configService.ts"
import {
  FgaCheckError,
  FgaBatchCheckError,
  FgaWriteError,
  FgaListObjectsError,
} from "../../../core/errors/fgaErrors.ts"

// ── Tuple types ───────────────────────────────────────────────────────────────

export interface FgaTuple {
  readonly user: string
  readonly relation: string
  readonly object: string
}

export interface FgaBatchCheckResult extends FgaTuple {
  readonly allowed: boolean
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface OpenFgaService {
  /**
   * Check a single permission: "can user X do relation Y on object Z?"
   * Returns true if allowed, false otherwise.
   */
  readonly check: (params: FgaTuple) => Effect.Effect<
    boolean,
    FgaCheckError
  >

  /**
   * Batch-check multiple permissions in one SDK call (parallel under the hood).
   * Preserves order — result[i] corresponds to checks[i].
   */
  readonly batchCheck: (checks: FgaTuple[]) => Effect.Effect<
    FgaBatchCheckResult[],
    FgaBatchCheckError
  >

  /**
   * Write relationship tuples (grant permissions).
   * Idempotent by default — duplicates are silently skipped.
   */
  readonly writeTuples: (tuples: FgaTuple[]) => Effect.Effect<
    void,
    FgaWriteError
  >

  /**
   * Delete relationship tuples (revoke permissions).
   * Missing tuples are silently skipped.
   */
  readonly deleteTuples: (tuples: FgaTuple[]) => Effect.Effect<
    void,
    FgaWriteError
  >

  /**
   * List all objects of a given type that `user` has the specified `relation` on.
   * e.g. listObjects({ user: "user:alice", relation: "viewer", type: "document" })
   *   → ["document:readme", "document:spec"]
   */
  readonly listObjects: (params: { user: string; relation: string; type: string }) => Effect.Effect<
    string[],
    FgaListObjectsError
  >
}

export const OpenFgaService = Context.Service<OpenFgaService>("@authz/OpenFgaService")

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildCredentials = (cfg: AppConfig["openfga"]): ConstructorParameters<typeof OpenFgaClient>[0]["credentials"] => {
  switch (cfg.credentialsMethod) {
    case "api_token":
      return {
        method: CredentialsMethod.ApiToken,
        config: { token: Redacted.value(cfg.apiToken) },
      }
    case "client_credentials":
      return {
        method: CredentialsMethod.ClientCredentials,
        config: {
          apiTokenIssuer: cfg.tokenIssuer,
          apiAudience: cfg.apiAudience,
          clientId: cfg.clientId,
          clientSecret: Redacted.value(cfg.clientSecret),
        },
      }
    default:
      // "none" or any unrecognised value → no credentials
      return { method: CredentialsMethod.None }
  }
}

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const config = yield* AppConfig
  const fgaCfg = config.openfga

  // Acquire: construct client
  const client = yield* Effect.acquireRelease(
    Effect.sync(() =>
      new OpenFgaClient({
        apiUrl: fgaCfg.apiUrl,
        storeId: fgaCfg.storeId,
        ...(fgaCfg.modelId !== "" ? { authorizationModelId: fgaCfg.modelId } : {}),
        credentials: buildCredentials(fgaCfg),
      })
    ),
    // Release: no explicit close needed for HTTP client — just signal disposal
    (_client) => Effect.sync(() => { /* no-op: OpenFgaClient is stateless HTTP */ })
  )

  // ── check ─────────────────────────────────────────────────────────────────

  const check = (params: FgaTuple) =>
    Effect.tryPromise({
      try: async () => {
        const req: ClientCheckRequest = {
          user: params.user,
          relation: params.relation,
          object: params.object,
        }
        const res = await client.check(req)
        return res.allowed ?? false
      },
      catch: (cause) =>
        new FgaCheckError({ user: params.user, relation: params.relation, object: params.object, cause }),
    })

  // ── batchCheck ────────────────────────────────────────────────────────────

  const batchCheck = (checks: FgaTuple[]) =>
    Effect.tryPromise({
      try: async () => {
        if (checks.length === 0) return []

        const req: ClientBatchCheckRequest = {
          checks: checks.map((c): ClientBatchCheckItem => ({
            user: c.user,
            relation: c.relation,
            object: c.object,
          })),
        }

        const res = await client.batchCheck(req)

        // Each result carries the original request — use it to avoid index-based mapping
        return res.result.map((r) => ({
          user: r.request.user,
          relation: r.request.relation,
          object: r.request.object,
          allowed: r.allowed,
        })) satisfies FgaBatchCheckResult[]
      },
      catch: (cause) => new FgaBatchCheckError({ cause }),
    })

  // ── writeTuples ───────────────────────────────────────────────────────────

  const writeTuples = (tuples: FgaTuple[]) =>
    Effect.tryPromise({
      try: async () => {
        if (tuples.length === 0) return
        const req: ClientWriteRequest = {
          writes: tuples.map((t) => ({
            user: t.user,
            relation: t.relation,
            object: t.object,
          })),
        }
        await client.write(req, {
          transaction: { disable: true },
          conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore },
        })
      },
      catch: (cause) => new FgaWriteError({ operation: "write", cause }),
    })

  // ── deleteTuples ──────────────────────────────────────────────────────────

  const deleteTuples = (tuples: FgaTuple[]) =>
    Effect.tryPromise({
      try: async () => {
        if (tuples.length === 0) return
        const req: ClientWriteRequest = {
          deletes: tuples.map((t) => ({
            user: t.user,
            relation: t.relation,
            object: t.object,
          })),
        }
        await client.write(req, {
          transaction: { disable: true },
          conflict: { onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore },
        })
      },
      catch: (cause) => new FgaWriteError({ operation: "delete", cause }),
    })

  // ── listObjects ───────────────────────────────────────────────────────────

  const listObjects = (params: { user: string; relation: string; type: string }) =>
    Effect.tryPromise({
      try: async () => {
        const req: ClientListObjectsRequest = {
          user: params.user,
          relation: params.relation,
          type: params.type,
        }
        const res = await client.listObjects(req)
        return res.objects ?? []
      },
      catch: (cause) =>
        new FgaListObjectsError({
          user: params.user,
          relation: params.relation,
          type: params.type,
          cause,
        }),
    })

  return OpenFgaService.of({ check, batchCheck, writeTuples, deleteTuples, listObjects })
})

export const OpenFgaServiceLive = Layer.effect(OpenFgaService, make)
