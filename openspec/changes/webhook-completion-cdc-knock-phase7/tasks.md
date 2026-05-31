## 1. Dependencies

- [ ] 1.1 Install `standardwebhooks` package: `bun add standardwebhooks`
- [ ] 1.2 Remove legacy Express packages: `bun remove express-rate-limit express-prom-bundle express-async-handler express-mongo-sanitize express-timeout-handler`

## 2. WebhookPublisher Service

- [ ] 2.1 Create `src/workers/shared/webhookPublisher.ts` — `WebhookPublisher` Effect service with `DomainEvent` union type and `emit(event, data)` method
- [ ] 2.2 Add `WebhookPublisherLive` layer to `src/workers/shared/workerLayer.ts`

## 3. Webhook Route Implementation

- [ ] 3.1 Update `src/workers/webhookWorker.ts` — replace custom `buildSignature` with `standardwebhooks` `Webhook` class; update header names to Standard Webhooks spec
- [ ] 3.2 Implement `POST /webhooks` in `webhookRoutes.ts` — auth guard, secret generation, Drizzle insert
- [ ] 3.3 Implement `GET /webhooks` — query subscriptions by userId
- [ ] 3.4 Implement `DELETE /webhooks/:id` — ownership check, Drizzle delete
- [ ] 3.5 Implement `POST /webhooks/:id/test` — ownership check, publish test event to queue

## 4. Cross-Worker Webhook Emission

- [ ] 4.1 Add `WebhookPublisher.emit("email.sent" | "email.bounced", ...)` to `src/workers/emailWorker.ts` (wrapped in `Effect.ignoreLogged`)
- [ ] 4.2 Add `WebhookPublisher.emit("receipt.generated", ...)` to `src/workers/pdfReceiptWorker.ts`
- [ ] 4.3 Add `WebhookPublisher.emit("leaderboard.score.updated", ...)` to `src/workers/leaderboardWorker.ts`

## 5. CDC Worker v2

- [ ] 5.1 Create `src/workers/cdcWorker.ts` — Effect-based CDC with MongoDB change streams, PG polling, `Queue.dropping`, `Stream.debounce`, `lru-cache` dedup, graceful shutdown
- [ ] 5.2 Add `"worker:cdc": "bun src/workers/cdcWorker.ts"` to `package.json` scripts

## 6. Knock Webhook Bridge

- [ ] 6.1 Add `KNOCK_WEBHOOK_SECRET` to `AppConfig` schema
- [ ] 6.2 Create `src/app/features/notifications/knockWebhookRoute.ts` — signature verification, event mapping, `WebhookPublisher.emit`
- [ ] 6.3 Register `knockWebhookRoute` in the main Fastify app

## 7. Phase 7 Cleanup

- [ ] 7.1 Delete `src/app/helpers/email.ts` and `src/app/helpers/cache/redisFunctions.ts` (replaced by `EmailServiceLive` and `RedisServiceLive`)
- [ ] 7.2 Run `bunx tsc --noEmit` — fix all type errors
- [ ] 7.3 Run `bun run check` — linting, format, layer checks
- [ ] 7.4 Commit: `feat(webhooks): complete webhook CRUD, cross-worker events, CDC v2, Knock bridge`
