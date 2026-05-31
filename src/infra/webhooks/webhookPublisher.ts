/**
 * src/infra/webhooks/webhookPublisher.ts
 *
 * WebhookPublisher — fire-and-forget domain event emitter.
 *
 * Usage (from any Effect context that has WorkerLayer):
 *   yield* Effect.flatMap(WebhookPublisher, p =>
 *     p.emit("email.sent", { to, subject })
 *   ).pipe(Effect.ignore)
 *
 * Behaviour:
 *   1. Queries webhookSubscriptions for enabled rows where `events` array
 *      contains the given event name (Postgres array containment: @>).
 *   2. For each matching subscription inserts a `webhookDeliveries` record
 *      with status="pending".
 *   3. Publishes a WebhookJob to RabbitMQ routing key "webhooks.deliver".
 *
 * Errors are swallowed at the emit() boundary — delivery failures do not
 * propagate to callers (consistent with fire-and-forget semantics).
 * All errors are still logged via Effect.logError.
 */

import { Context, Effect, Layer } from "effect"
import { sql } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { PostgresService } from "../postgres/postgresService.ts"
import { RabbitMQService } from "../rabbitmq/rabbitmqService.ts"
import { webhookSubscriptions, webhookDeliveries } from "../../db/schema/webhookSchema.ts"

// ── Shared message type (imported by webhookWorker) ───────────────────────────

export interface WebhookJob {
  readonly deliveryId: string
  readonly subscriptionId: string
  readonly event: string
  readonly payload: unknown
  readonly secret: string
  readonly url: string
  readonly attempt: number
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface WebhookPublisher {
  /**
   * Emit a domain event to all enabled subscribers listening for `event`.
   * Always resolves — errors are logged internally and never propagated.
   */
  readonly emit: (event: string, data: unknown) => Effect.Effect<void, never>
}

export const WebhookPublisher = Context.Service<WebhookPublisher>("@infra/WebhookPublisher")

// ── Live implementation ───────────────────────────────────────────────────────

const make = Effect.gen(function* () {
  const postgres = yield* PostgresService
  const rabbit = yield* RabbitMQService

  const emit = (event: string, data: unknown): Effect.Effect<void, never> => {
    const inner = Effect.gen(function* () {
      // 1. Find all enabled subscriptions for this event
      const subs = yield* postgres.query((db) =>
        db
          .select()
          .from(webhookSubscriptions)
          .where(
            sql`${webhookSubscriptions.enabled} = true
            AND ${webhookSubscriptions.events} @> ARRAY[${event}]::text[]`
          )
      )

      if (subs.length === 0) return

      // 2. For each subscription: insert delivery record + publish to RabbitMQ
      yield* Effect.forEach(
        subs,
        (sub) =>
          Effect.gen(function* () {
            const deliveryId = createId()

            // Insert pending delivery record
            yield* postgres
              .query((db) =>
                db.insert(webhookDeliveries).values({
                  id: deliveryId,
                  subscriptionId: sub.id,
                  event,
                  payload: data as Record<string, unknown>,
                  status: "pending",
                  attempts: 0,
                })
              )
              .pipe(Effect.ignore)

            // Publish delivery job to RabbitMQ
            const job: WebhookJob = {
              deliveryId,
              subscriptionId: sub.id,
              event,
              payload: data,
              secret: sub.secret,
              url: sub.url,
              attempt: 0,
            }

            yield* rabbit
              .publish("main-exchange", "webhooks.deliver", job)
              .pipe(Effect.ignore)
          }),
        { discard: true, concurrency: "unbounded" },
      )
    })

    return inner.pipe(
      Effect.catchCause((cause) =>
        Effect.logError("[webhook-publisher] failed to emit event", { event, cause })
      ),
    )
  }

  return WebhookPublisher.of({ emit })
})

export const WebhookPublisherLive = Layer.effect(WebhookPublisher, make)
