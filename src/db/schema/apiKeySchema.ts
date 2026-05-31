/**
 * src/db/schema/apiKeySchema.ts
 *
 * API keys table.
 *
 * Key design:
 *   - Raw key is returned ONCE at creation and never stored.
 *   - `prefix` (first 8 chars of the random portion) enables fast DB lookup
 *     before the expensive argon2 verify — avoids full-table scans.
 *   - Format: `sk_live_<32 random hex chars>` (prod) or `sk_test_<...>` (non-prod)
 *   - Scopes stored as jsonb string array: ["read", "write", "webhooks:manage"]
 *
 * Used by:
 *   - apiKeyService.ts — CRUD operations
 *   - apiKeyMiddleware.ts — verify on inbound request
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  jsonb,
  varchar,
  char,
  index,
} from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => createId()),

    /** Owner of this key */
    userId: uuid("user_id").notNull(),

    /** Human-readable label: "CI Pipeline", "My App" */
    name: varchar("name", { length: 100 }).notNull(),

    /**
     * First 8 hex chars of the random portion.
     * Used for prefix-scoped DB lookup: WHERE prefix = ? AND is_active = true
     * This narrows the result set before argon2 verify.
     */
    prefix: char("prefix", { length: 8 }).notNull(),

    /** argon2id hash of the full raw key */
    keyHash: text("key_hash").notNull(),

    /** Optional scopes this key is restricted to */
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),

    /** Optional hard expiry. NULL = never expires. */
    expiresAt: timestamp("expires_at"),

    isActive: boolean("is_active").default(true).notNull(),

    /** Last-used timestamp for activity monitoring (updated async, not on every request) */
    lastUsedAt: timestamp("last_used_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => ({
    userIdx: index("api_keys_user_idx").on(t.userId),
    prefixIdx: index("api_keys_prefix_idx").on(t.prefix),
    /** Composite: fast "is this prefix active?" lookup */
    prefixActiveIdx: index("api_keys_prefix_active_idx").on(t.prefix, t.isActive),
  })
)
