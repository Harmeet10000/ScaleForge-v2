/**
 * src/workers/webhookWorker.ts
 *
 * Core webhook delivery logic.
 *
 * Signs outbound payloads using the Standard Webhooks spec (HMAC-SHA256).
 * Consumers verify with:
 *   const wh = new Webhook(secret)
 *   wh.verify(body, headers)
 *
 * Standard Webhooks headers:
 *   webhook-id        — unique delivery ID (idempotency key)
 *   webhook-timestamp — Unix epoch seconds (replay protection)
 *   webhook-signature — "v1,<base64-HMAC-SHA256>" (one or more comma-separated)
 *
 * Additional ScaleForge routing headers (convenience, not part of the spec):
 *   x-scaleforge-event    — event name
 *   x-scaleforge-delivery — same as webhook-id
 */

import { Effect } from "effect"
import { request } from "undici"
import { Webhook } from "standardwebhooks"
import { RabbitMQPublishError } from "../core/errors/infraErrors.ts"

export interface WebhookJob {
  readonly deliveryId: string
  readonly subscriptionId: string
  readonly event: string
  readonly payload: unknown
  readonly secret: string
  readonly url: string
  readonly attempt: number
}

// Exponential backoff delays in seconds: 30s, 5m, 30m, 2h, 8h
const BACKOFF_DELAYS_SECS = [30, 300, 1800, 7200, 28800] as const
export const MAX_ATTEMPTS = BACKOFF_DELAYS_SECS.length

export const nextRetryDelaySecs = (attempt: number): number =>
  BACKOFF_DELAYS_SECS[attempt] ?? BACKOFF_DELAYS_SECS[BACKOFF_DELAYS_SECS.length - 1]!

export const deliverWebhook = (job: WebhookJob) =>
  Effect.gen(function* () {
    const body = JSON.stringify({ event: job.event, data: job.payload })

    // Standard Webhooks signing — compatible with GitHub, Stripe, Svix consumers
    const wh = new Webhook(job.secret)
    const timestamp = new Date()
    const signature = wh.sign(job.deliveryId, timestamp, body)
    const timestampSecs = Math.floor(timestamp.getTime() / 1000).toString()

    const { statusCode } = yield* Effect.tryPromise({
      try: () =>
        request(job.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Standard Webhooks spec headers
            "webhook-id": job.deliveryId,
            "webhook-timestamp": timestampSecs,
            "webhook-signature": signature,
            // ScaleForge routing convenience headers
            "x-scaleforge-event": job.event,
            "x-scaleforge-delivery": job.deliveryId,
          },
          body,
        }),
      catch: (error) =>
        new RabbitMQPublishError({
          exchange: "webhooks",
          routingKey: job.event,
          cause: error,
        }),
    })

    if (statusCode < 200 || statusCode >= 300) {
      return yield* Effect.fail(
        new RabbitMQPublishError({
          exchange: "webhooks",
          routingKey: job.event,
          cause: new Error(`HTTP ${statusCode}`),
        })
      )
    }

    return statusCode
  })
