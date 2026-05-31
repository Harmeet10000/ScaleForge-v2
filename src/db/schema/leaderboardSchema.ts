/**
 * src/db/schema/leaderboardSchema.ts
 *
 * PostgreSQL event log for leaderboard score events.
 *
 * This is the audit/replayable source of truth.
 * Redis sorted sets are the live read layer — derived from this log.
 *
 * Used by:
 *   - leaderboardService.ts — inserts on every score event
 *   - leaderboardWorker.ts — processes events via RabbitMQ
 *   - Admin tooling — replay Redis state from this log
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"

export const leaderboardEvents = pgTable(
  "leaderboard_events",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => createId()),

    /** User whose score changed */
    userId: uuid("user_id").notNull(),

    /**
     * Score change (positive = gain, negative = deduction).
     * Not constrained to positive — supports score corrections.
     */
    delta: integer("delta").notNull(),

    /**
     * What triggered this score change.
     * Examples: "quiz_complete", "challenge_win", "purchase", "admin_adjust"
     */
    entityType: varchar("entity_type", { length: 50 }).notNull(),

    /** ID of the entity that triggered the event (quiz ID, challenge ID, etc.) */
    entityId: uuid("entity_id"),

    /** Arbitrary metadata (quiz score, rank, etc.) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),

    /** When the event occurred (may differ from createdAt for backdated events) */
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),

    /** When we recorded it */
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("lb_events_user_idx").on(t.userId),
    occurredAtIdx: index("lb_events_occurred_at_idx").on(t.occurredAt),
    /** For rolling window queries: fetch events after a timestamp for a user */
    userTimeIdx: index("lb_events_user_time_idx").on(t.userId, t.occurredAt),
    entityIdx: index("lb_events_entity_idx").on(t.entityType, t.entityId),
  })
)
