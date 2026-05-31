## webhook-subscriptions

### ADDED Requirements

1. `POST /api/v1/webhooks` — authenticated users can register a webhook endpoint
   - Requires `Authorization: Bearer <token>` (PASETO); 401 if missing/invalid
   - Body: `{ url: string (HTTPS only), events: string[] (non-empty) }`
   - Generates a `whsec_<hex32>` signing secret using `crypto.randomBytes(32).toString('hex')`
   - Inserts into `webhook_subscriptions` with `userId = request.user.sub`
   - Returns `{ id, url, events, secret, enabled, createdAt }` — secret shown ONCE
   - 400 on invalid body (schema validation via Effect Schema)

2. `GET /api/v1/webhooks` — list all subscriptions for current user
   - Requires auth
   - Returns `{ data: Array<{ id, url, events, enabled, createdAt, updatedAt }> }` (secret excluded)
   - Filters by `userId = request.user.sub`

3. `DELETE /api/v1/webhooks/:id` — remove a subscription
   - Requires auth
   - 404 if subscription not found OR belongs to another user
   - Cascades to `webhook_deliveries` via DB foreign key

4. `POST /api/v1/webhooks/:id/test` — send a test event to verify endpoint
   - Requires auth
   - 404 if subscription not found or not owned by user
   - Publishes a `{ event: "webhook.test", data: { timestamp } }` to `webhooks.deliver` queue
   - Returns `{ deliveryId: string }` immediately (async delivery)

5. Signature format: Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers)
   - All outgoing deliveries use `standardwebhooks` Webhook class for signing
   - Consumers verify using Standard Webhooks SDK with the `whsec_` prefixed secret
   - Anti-replay: `webhook-timestamp` must be within ±5 minutes of receipt (enforced by SDK)
