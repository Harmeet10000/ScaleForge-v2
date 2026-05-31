## knock-webhook-bridge

### ADDED Requirements

1. `POST /api/v1/notifications/knock/webhook` — inbound route for Knock lifecycle events
   - No user auth required (machine-to-machine, Knock sends the request)
   - Verifies `X-Knock-Signature` header using HMAC-SHA256 with `KNOCK_WEBHOOK_SECRET` env var
   - 401 if signature missing or invalid
   - Rate limited: 100 requests/minute per IP via `@fastify/rate-limit`

2. **Supported inbound event types** (from Knock):
   | Knock event | ScaleForge domain event |
   |-------------|------------------------|
   | `message.delivered` | `notification.delivered` |
   | `message.delivery_attempt.bounced` | `notification.failed` |
   | `message.undelivered` | `notification.failed` |
   | `workflow.run.finished` | (logged, not forwarded — internal) |

3. After verification and event mapping:
   - Call `WebhookPublisher.emit(domainEvent, knockPayload)` to fan out to subscriber webhooks
   - Return `{ received: true }` with 200

4. `KNOCK_WEBHOOK_SECRET` added to `AppConfig` schema (required env var)

5. Route registered in `src/app/features/notifications/knockWebhookRoute.ts` (new file)
   - Registered in the Fastify app under `/api/v1/notifications/knock/webhook`
