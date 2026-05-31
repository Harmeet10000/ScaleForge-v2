## Context

ScaleForge-v2 is mid-migration from Express to Fastify + Effect. The webhook infrastructure is 80% complete:
- `webhookDeliveryWorker.ts` — production-grade RabbitMQ consumer with retries, DLQ, Effect fibers
- `webhookWorker.ts` — custom HMAC-SHA256 delivery via undici
- `webhookSchema.ts` — Drizzle PG schema (webhookSubscriptions, webhookDeliveries)
- `webhookRoutes.ts` — fully stubbed (all 4 routes return 501)

The missing 20%: route logic (auth → DB → secret generation), spec-compliant signing, cross-worker event publishing, CDC worker implementation, and Knock inbound event bridge.

**Webhook package decision**: Keep custom delivery worker (already production-grade). Adopt `standardwebhooks` npm package for signature format — this is the HMAC-SHA256 spec used by Stripe, GitHub, Shopify. It's signing-only (zero managed infra), ensures consumer-side SDK compatibility, and upgrades the existing custom `sha256=...` format to the Standard Webhooks spec (`v1,t=<timestamp>,sha256=<hmac>`).

## Goals / Non-Goals

**Goals:**
- Wire all 4 webhook CRUD routes using `request.user.sub` from `requireAuth` preHandler
- Generate cryptographically secure secrets with `crypto.randomBytes(32).toString('hex')`  
- Adopt `standardwebhooks` for spec-compliant `whsec_` prefixed secrets + timestamp-in-signature anti-replay
- Expose a `WebhookPublisher` Effect service in `WorkerLayer` so every worker can fire domain events in 2 lines
- Implement CDC worker v2 with Effect layers, `Stream.debounce`, `Queue.dropping`, `lru-cache`
- Bridge inbound Knock webhook events to outbound subscriber webhooks

**Non-Goals:**
- Migrate to Svix managed service (would replace the delivery worker; premature given custom infra is solid)
- Multi-tenancy webhook namespacing (confirmed single-tenant, per D4)
- Webhook replay UI / customer portal (future phase)

## Decisions

### D1: Use `standardwebhooks` not Svix
Svix requires an external service account and replaces the entire delivery stack. The existing delivery worker has retries, DLQ, fibers, and Drizzle persistence — that's already production-grade. `standardwebhooks` is a signing-only library (<2KB) that makes the signature format interoperable. Consumers can use any Standard Webhooks SDK to verify.

Signature format upgrade:
```
# Before (custom):
X-ScaleForge-Signature: sha256=<hex>

# After (Standard Webhooks):
webhook-id: <deliveryId>
webhook-timestamp: <unix_seconds>
webhook-signature: v1,<base64>
```

### D2: WebhookPublisher as Effect service in WorkerLayer
Rather than each worker calling `RabbitMQService.publish` directly with raw exchange/routing-key strings, a typed `WebhookPublisher` service wraps the RabbitMQ publish call with:
- Event name as a TypeScript string literal union
- Automatic routing key: `webhooks.{event}`
- Payload serialized as the standard `{ event, data, timestamp }` envelope

This prevents mismatched exchange names and gives compile-time event name checking.

### D3: CDC worker uses MongoDB change streams + PG polling
- MongoDB: `collection.watch()` → change stream → `Queue.offer` → `Stream.fromQueue` → `Stream.debounce("500 millis")` → cache invalidation + webhook emit
- PostgreSQL: `Effect.schedule` polling on `updated_at > last_checked` → same handler chain
- Dedup with `lru-cache` (max: 5000, ttl: 30s) to prevent duplicate cache clears within debounce window
- `async-cache-dedupe` for concurrent Mongo document fetches during cache population

### D4: Knock inbound route signs with `KNOCK_SIGNING_SECRET`
Knock sends `X-Knock-Signature` header (HMAC-SHA256). Route verifies signature, maps Knock event type to a ScaleForge domain event (`knock.message.delivered` → `notification.delivered`), then calls `WebhookPublisher.emit` to fan out to subscribers.

### D5: requireAuth preHandler applied at plugin level for webhook routes
`webhookRoutes.ts` registers `requireAuth` as a Fastify route-level `preHandler` on each route (not globally), keeping the pattern consistent with `auth2/authRoutes.ts`. The `userId` is read from `request.user!.sub`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Breaking signature format change | Old format (`X-ScaleForge-Signature`) was never live (routes were 501) — no consumers exist. Safe to switch immediately. |
| CDC change streams require MongoDB 4.0+ replica set | Already required by existing Mongoose setup; change streams only work on replica sets. Document in runbook. |
| Knock inbound route exposed without rate limiting | Apply `@fastify/rate-limit` (already installed) to the Knock route: 100/min per IP. |
| `lru-cache` import in CDC worker | `lru-cache` v10 is already in `package.json` (used by other infra). No new dep needed. |
