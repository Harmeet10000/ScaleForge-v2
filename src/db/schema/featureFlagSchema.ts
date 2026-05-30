import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"

// Feature flags: DB-backed, LRU-cached with 30s TTL (Decision #77)
export const featureFlags = pgTable("feature_flags", {
  id:          text("id").primaryKey().$defaultFn(() => createId()),
  key:         text("key").notNull().unique(),        // e.g. "new_checkout_flow"
  enabled:     boolean("enabled").notNull().default(false),
  description: text("description"),
  // Optional per-user / per-tenant targeting as a JSON allow-list
  targeting:   jsonb("targeting").$type<{ userIds?: string[]; tenantIds?: string[] }>(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
})
