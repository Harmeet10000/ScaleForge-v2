## webhook-cross-worker

### ADDED Requirements

1. `WebhookPublisher` Effect service in `src/workers/shared/webhookPublisher.ts`
   - `Context.Service<WebhookPublisher>("@workers/WebhookPublisher")`
   - Single method: `emit(event: DomainEvent, data: unknown): Effect.Effect<void, RabbitMQPublishError>`
   - Looks up all enabled `webhook_subscriptions` matching the event name
   - For each subscriber: inserts a `webhook_deliveries` row (status: pending), publishes job to `webhooks.deliver` queue
   - Uses `PostgresService` + `RabbitMQService` from context

2. `DomainEvent` union type exported from `webhookPublisher.ts`:
   ```
   payment.completed | payment.failed | subscription.renewed |
   email.sent | email.bounced |
   receipt.generated |
   leaderboard.score.updated |
   user.updated | subscription.updated |
   notification.delivered | notification.failed |
   webhook.test
   ```

3. `WebhookPublisherLive` layer added to `WorkerLayer` in `src/workers/shared/workerLayer.ts`
   - Provides `WebhookPublisher`, requires `PostgresService + RabbitMQService`

4. Each worker emits domain events:
   - `emailWorker.ts` — emits `email.sent` / `email.bounced` after send attempt
   - `pdfReceiptWorker.ts` — emits `receipt.generated` after successful PDF upload
   - `leaderboardWorker.ts` — emits `leaderboard.score.updated` after score commit
   - `searchIngestWorker.ts` — no webhook event (internal only)
   - CDC worker (see cdc-worker spec) — emits `user.updated` / `subscription.updated`

5. Emission is best-effort: webhook publish failure MUST NOT cause the primary worker job to fail
   - Wrap `WebhookPublisher.emit(...)` in `Effect.ignoreLogged` within each worker
