## cdc-worker

### ADDED Requirements

1. `src/workers/cdcWorker.ts` — standalone Bun worker process with its own `ManagedRuntime`
   - Extends `WorkerLayer` (gains `WebhookPublisher`)
   - Entrypoint: `bun src/workers/cdcWorker.ts`
   - `package.json` script: `"worker:cdc": "bun src/workers/cdcWorker.ts"`

2. **MongoDB Change Stream pipeline** (for `users` and `subscriptions` collections):
   - `collection.watch([{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }])`
   - Change events → `Queue.offer` into a `Queue.dropping(1000)` queue (drop oldest on overflow)
   - `Stream.fromQueue` → `Stream.debounce("500 millis")` to batch rapid successive changes
   - Handler: invalidate Redis cache key, re-populate from source, emit domain event via `WebhookPublisher`

3. **PostgreSQL polling CDC** (for tables without change streams):
   - `Effect.repeat` with `Schedule.fixed("10 seconds")`
   - Query: `SELECT * FROM <table> WHERE updated_at > $last_checked`
   - Same invalidation + webhook emit pipeline as MongoDB

4. **Dedup guard** using `lru-cache`:
   - `new LRUCache<string, true>({ max: 5000, ttl: 30_000 })`
   - Cache key: `${collection}:${documentId}`
   - If key exists in cache, skip processing (already handled within debounce window)
   - Prevents duplicate cache clears and duplicate webhook emissions

5. **Effect service structure** (no OOP classes):
   ```
   MongoWatcherService — Context.Service, acquires/releases change stream cursor
   PgPollerService     — Context.Service, runs scheduled polling
   CdcOrchestratorService — Context.Service, composes watchers, manages dedup cache
   ```

6. **Graceful shutdown**: `close-with-grace` 10s window, same pattern as `webhookDeliveryWorker.ts`

7. **Domain events emitted**:
   - MongoDB `users` collection changes → `user.updated`
   - MongoDB/PG `subscriptions` changes → `subscription.updated`
