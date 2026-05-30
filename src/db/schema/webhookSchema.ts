import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id:        text("id").primaryKey().$defaultFn(() => createId()),
  userId:    text("user_id").notNull(),
  url:       text("url").notNull(),
  events:    text("events").array().notNull(), // ["payment.completed", "subscription.renewed"]
  secret:    text("secret").notNull(),         // HMAC-SHA256 signing secret
  enabled:   boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id:             text("id").primaryKey().$defaultFn(() => createId()),
  subscriptionId: text("subscription_id")
    .notNull()
    .references(() => webhookSubscriptions.id, { onDelete: "cascade" }),
  event:          text("event").notNull(),
  payload:        jsonb("payload").notNull(),
  status:         text("status").notNull().default("pending"), // pending | delivered | failed
  statusCode:     integer("status_code"),
  attempts:       integer("attempts").notNull().default(0),
  lastAttemptAt:  timestamp("last_attempt_at"),
  nextAttemptAt:  timestamp("next_attempt_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
})
