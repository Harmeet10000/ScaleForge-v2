/**
 * src/app/features/auth/apiKeyService.ts
 *
 * API key lifecycle management.
 *
 * Key format:  sk_live_<32 hex chars>   (production)
 *              sk_test_<32 hex chars>   (non-production)
 * Prefix:      first 8 hex chars of the random portion (used for DB lookup)
 * Storage:     argon2id hash of the full raw key — raw key never persisted
 *
 * Flow (verify):
 *   1. Extract prefix from incoming key (chars 8–16)
 *   2. SELECT WHERE prefix = ? AND is_active = true
 *   3. argon2 verify against keyHash — O(1) DB hit, 1 hash verify
 *   4. Check expiry and revoked state
 *   5. Best-effort async update of last_used_at (fire-and-forget)
 */

import { Context, Effect, Layer } from "effect"
import { eq, and } from "drizzle-orm"
import { randomBytes } from "node:crypto"
import argon2 from "argon2"
import { PostgresService } from "../../../infra/postgres/postgresService.ts"
import { AppConfig } from "../../../core/config/configService.ts"
import { apiKeys } from "../../../db/schema/apiKeySchema.ts"
import {
  ApiKeyNotFoundError,
  ApiKeyExpiredError,
  ApiKeyRevokedError,
} from "../../../core/errors/authErrors.ts"

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * argon2 options tuned for API key hashing.
 * Keys are high-entropy (256 bit random) so we can use lower memory
 * than passwords — still argon2id per project constraint.
 */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 2 ** 14,  // 16 MiB (vs 64 MiB for passwords — keys are pre-entropied)
  timeCost: 2,
  parallelism: 1,
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateApiKeyInput {
  readonly userId: string
  readonly name: string
  readonly scopes?: string[]
  readonly expiresAt?: Date
}

export interface CreatedApiKey {
  readonly id: string
  readonly key: string      // raw key — returned ONCE, never stored
  readonly prefix: string
  readonly name: string
  readonly scopes: string[]
  readonly expiresAt: Date | null
  readonly createdAt: Date
}

export interface ApiKeyMeta {
  readonly id: string
  readonly prefix: string
  readonly name: string
  readonly scopes: string[]
  readonly expiresAt: Date | null
  readonly lastUsedAt: Date | null
  readonly createdAt: Date
  readonly isActive: boolean
}

export interface VerifiedApiKey {
  readonly keyId: string
  readonly userId: string
  readonly scopes: string[]
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface ApiKeyService {
  readonly create: (input: CreateApiKeyInput) => Effect.Effect<CreatedApiKey, never>
  readonly verify: (rawKey: string) => Effect.Effect<
    VerifiedApiKey,
    ApiKeyNotFoundError | ApiKeyExpiredError | ApiKeyRevokedError
  >
  readonly revoke: (keyId: string, userId: string) => Effect.Effect<void, ApiKeyNotFoundError>
  readonly list: (userId: string) => Effect.Effect<ApiKeyMeta[], never>
}

export const ApiKeyService = Context.Service<ApiKeyService>("@auth/ApiKeyService")

// ── Helpers ───────────────────────────────────────────────────────────────────

const generateRawKey = (env: "live" | "test"): { rawKey: string; prefix: string } => {
  const hex = randomBytes(16).toString("hex")  // 32 hex chars = 128 bits
  const rawKey = `sk_${env}_${hex}`
  const prefix = hex.slice(0, 8)  // first 8 hex chars of random portion
  return { rawKey, prefix }
}

const extractPrefix = (rawKey: string): string | null => {
  // Format: sk_live_<hex> or sk_test_<hex>
  const match = /^sk_(?:live|test)_([0-9a-f]{8})/i.exec(rawKey)
  return match?.[1]?.toLowerCase() ?? null
}

// ── Implementation ────────────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const postgres = yield* PostgresService
  const config = yield* AppConfig

  const env = config.isDevelopment ? "test" : "live"

  const create = (input: CreateApiKeyInput): Effect.Effect<CreatedApiKey, never> =>
    Effect.gen(function* () {
      const { rawKey, prefix } = generateRawKey(env)
      const keyHash = yield* Effect.promise(() => argon2.hash(rawKey, ARGON2_OPTIONS))

      const now = new Date()
      const rows = yield* postgres.query((db) =>
        db.insert(apiKeys)
          .values({
            userId: input.userId,
            name: input.name,
            prefix,
            keyHash,
            scopes: input.scopes ?? [],
            expiresAt: input.expiresAt ?? null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
          .returning({
            id: apiKeys.id,
            scopes: apiKeys.scopes,
            expiresAt: apiKeys.expiresAt,
            createdAt: apiKeys.createdAt,
          })
      ).pipe(Effect.orDie)

      const row = rows[0]!
      return {
        id: row.id,
        key: rawKey,         // only time this is returned
        prefix,
        name: input.name,
        scopes: row.scopes,
        expiresAt: row.expiresAt ?? null,
        createdAt: row.createdAt!,
      } satisfies CreatedApiKey
    })

  const verify = (rawKey: string) =>
    Effect.gen(function* () {
      const prefix = extractPrefix(rawKey)
      if (!prefix) {
        return yield* Effect.fail(new ApiKeyNotFoundError({ prefix: "malformed" }))
      }

      // 1. Lookup by prefix (narrow set)
      const rows = yield* postgres.query((db) =>
        db.select({
          id: apiKeys.id,
          userId: apiKeys.userId,
          keyHash: apiKeys.keyHash,
          scopes: apiKeys.scopes,
          expiresAt: apiKeys.expiresAt,
          revokedAt: apiKeys.revokedAt,
          isActive: apiKeys.isActive,
        })
          .from(apiKeys)
          .where(and(eq(apiKeys.prefix, prefix), eq(apiKeys.isActive, true)))
      ).pipe(Effect.orDie)

      if (rows.length === 0) {
        return yield* Effect.fail(new ApiKeyNotFoundError({ prefix }))
      }

      // 2. argon2 verify against each candidate (almost always 1)
      // NOTE: Effect.gen + for..of + yield* breaks TypeScript type inference — the
      // entire verification is done inside Effect.promise to avoid this limitation.
      const matchedRow = yield* Effect.tryPromise({
        try: async () => {
          for (const row of rows) {
            const valid = await argon2.verify(row.keyHash, rawKey, ARGON2_OPTIONS)
            if (valid) return row
          }
          return null as (typeof rows)[0] | null
        },
        catch: () => new ApiKeyNotFoundError({ prefix }),
      })

      if (!matchedRow) {
        return yield* Effect.fail(new ApiKeyNotFoundError({ prefix }))
      }

      // 3. Check revoked
      if (matchedRow.revokedAt !== null) {
        return yield* Effect.fail(new ApiKeyRevokedError({ keyId: matchedRow.id }))
      }

      // 4. Check expiry
      if (matchedRow.expiresAt && matchedRow.expiresAt < new Date()) {
        return yield* Effect.fail(new ApiKeyExpiredError({ keyId: matchedRow.id }))
      }

      // 5. Best-effort async last_used_at update (fire-and-forget daemon fiber)
      yield* Effect.forkDetach(
        postgres.query((db) =>
          db.update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, matchedRow!.id))
        ).pipe(Effect.orDie)
      )

      return {
        keyId: matchedRow.id,
        userId: matchedRow.userId,
        scopes: matchedRow.scopes,
      } satisfies VerifiedApiKey
    })

  const revoke = (keyId: string, userId: string) =>
    Effect.gen(function* () {
      const rows = yield* postgres.query((db) =>
        db.select({ id: apiKeys.id })
          .from(apiKeys)
          .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
          .limit(1)
      ).pipe(Effect.orDie)

      if (rows.length === 0) {
        return yield* Effect.fail(new ApiKeyNotFoundError({ prefix: keyId }))
      }

      yield* postgres.query((db) =>
        db.update(apiKeys)
          .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
          .where(eq(apiKeys.id, keyId))
      ).pipe(Effect.orDie)
    })

  const list = (userId: string): Effect.Effect<ApiKeyMeta[], never> =>
    postgres.query((db) =>
      db.select({
        id: apiKeys.id,
        prefix: apiKeys.prefix,
        name: apiKeys.name,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        isActive: apiKeys.isActive,
      })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId))
        .orderBy(apiKeys.createdAt)
    ).pipe(
      Effect.map((rows) =>
        rows.map((r) => ({
          id: r.id,
          prefix: r.prefix,
          name: r.name,
          scopes: r.scopes,
          expiresAt: r.expiresAt ?? null,
          lastUsedAt: r.lastUsedAt ?? null,
          createdAt: r.createdAt!,
          isActive: r.isActive,
        }) satisfies ApiKeyMeta)
      ),
      Effect.orDie,
    )

  return ApiKeyService.of({ create, verify, revoke, list })
})

export const ApiKeyServiceLive = Layer.effect(ApiKeyService, make)
