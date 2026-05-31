## Why

Webhook routes are fully stubbed (501), the CDC worker exists only as an OOP v1 plan with no implementation, and Knock notification lifecycle events have no outbound delivery path. Phase 7 cleanup cannot close cleanly while these three systems remain inert — they represent the last active production gaps before the Express layer can be safely removed.

## What Changes

- **Webhook routes completed**: `POST /webhooks`, `GET /webhooks`, `DELETE /webhooks/:id`, `POST /webhooks/:id/test` — all currently return 501; will be wired to Drizzle + TokenService + standard-webhooks signing
- **Standard Webhooks signing adopted**: Replace custom HMAC header format with `@standard-webhooks/sdk`-compliant signatures (backward-compatible with existing delivery worker header names)
- **Cross-worker webhook publishing**: A shared `WebhookPublisher` Effect service added to `WorkerLayer` so payments, email, PDF, leaderboard, search-ingest, and CDC workers can emit events to the `webhooks.deliver` RabbitMQ queue without coupling to webhook internals
- **CDC worker v2 implemented**: New `src/workers/cdcWorker.ts` replaces the OOP v1 plan — uses Effect layers, `Stream.debounce`, `Queue.dropping`, `lru-cache`, and fires webhook events on user/subscription changes
- **Knock webhook integration**: Inbound Knock lifecycle events (`message.delivered`, `message.status_change`, `workflow.run.finished`) handled via a verified inbound route; outbound notification events forwarded to subscriber webhooks
- **Phase 7 cleanup**: Remove `express-rate-limit`, `express-prom-bundle`, `express-async-handler`, `express-mongo-sanitize`, `express-timeout-handler` from `dependencies`; delete replaced legacy helper files

## Capabilities

### New Capabilities

- `webhook-subscriptions`: CRUD management of webhook endpoint registrations (url, events filter, secret, enabled flag) with PASETO auth and Standard Webhooks-compliant signing
- `webhook-cross-worker`: Shared `WebhookPublisher` service that any worker can use to emit typed domain events through the existing RabbitMQ delivery pipeline
- `cdc-worker`: Effect-based change-data-capture worker that watches MongoDB change streams and PostgreSQL polling, debounces updates, refreshes Redis cache, and emits webhook events for `user.updated` / `subscription.updated`
- `knock-webhook-bridge`: Inbound route that verifies Knock webhook signatures and forwards notification lifecycle events to outbound subscriber webhooks

### Modified Capabilities

<!-- No existing spec-level requirements change — all new capabilities -->

## Impact

**Code affected:**
- `src/app/features/webhooks/webhookRoutes.ts` — full route implementation replacing 501 stubs
- `src/workers/webhookWorker.ts` — adopt `standardwebhooks` Webhook class for signing
- `src/workers/shared/workerLayer.ts` — add `WebhookPublisherLive` layer
- `src/workers/cdcWorker.ts` — new file (Effect-based CDC, ~200 lines)
- `src/workers/emailWorker.ts`, `pdfReceiptWorker.ts`, `leaderboardWorker.ts`, `searchIngestWorker.ts` — each gains 2-3 lines to emit domain events via `WebhookPublisher`
- `src/app/features/notifications/knockWebhookRoute.ts` — new inbound route for Knock events
- `package.json` — add `standardwebhooks`; remove 5 legacy `express-*` packages

**Dependencies:**
- New: `standardwebhooks` (Standard Webhooks SDK — zero-dep signing library)
- Removed: `express-rate-limit`, `express-prom-bundle`, `express-async-handler`, `express-mongo-sanitize`, `express-timeout-handler`

**APIs affected:**
- `POST /api/v1/webhooks` — previously 501, now live
- `GET /api/v1/webhooks` — previously 501, now live
- `DELETE /api/v1/webhooks/:id` — previously 501, now live
- `POST /api/v1/webhooks/:id/test` — previously 501, now live
- `POST /api/v1/notifications/knock/webhook` — new inbound Knock event route

**Systems affected:** RabbitMQ (`webhooks.deliver` queue), PostgreSQL (webhookSubscriptions, webhookDeliveries tables), Redis (CDC cache invalidation), MongoDB (change streams in CDC)
