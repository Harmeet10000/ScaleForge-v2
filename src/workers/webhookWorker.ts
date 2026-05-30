import { createHmac } from "node:crypto"
import { Effect } from "effect"
import { request } from "undici"
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

const buildSignature = (secret: string, body: string): string =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`

export const deliverWebhook = (job: WebhookJob) =>
  Effect.gen(function* () {
    const body = JSON.stringify({ event: job.event, data: job.payload })
    const signature = buildSignature(job.secret, body)

    const { statusCode } = yield* Effect.tryPromise({
      try: () =>
        request(job.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ScaleForge-Signature": signature,
            "X-ScaleForge-Event": job.event,
            "X-ScaleForge-Delivery": job.deliveryId,
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
