# Secrets Rotation Runbook

## Access / Refresh Token Secrets

These are used to sign/verify PASETO tokens. Rotating invalidates all active sessions
(users must re-login). Because access tokens are short-lived (15m), impact is minimal.

```bash
# Generate a new secret (minimum 32 bytes)
openssl rand -base64 64
```

1. Set `TF_VAR_ACCESS_TOKEN_SECRET=<new-value>` in GitHub Secrets
2. Set `TF_VAR_REFRESH_TOKEN_SECRET=<new-value>` in GitHub Secrets
3. Push to main → deploy workflow re-deploys with new secrets
4. All existing tokens become invalid on next verification
5. Schedule: every 90 days

---

## Database Password (PostgreSQL / RDS)

RDS supports password change without downtime. The connection pool reconnects automatically.

```bash
# 1. Generate new password
openssl rand -base64 32

# 2. Apply via Terraform
TF_VAR_db_password="<new>" terraform apply -target=aws_db_instance.main

# 3. Update GitHub Secret
gh secret set TF_VAR_DB_PASSWORD --body "<new>"
```

Schedule: every 180 days

---

## Redis Password

Redis does not support zero-downtime password rotation. A maintenance window is required.

1. Schedule a 5-minute maintenance window
2. Update `requirepass <new>` in ElastiCache parameter group
3. Update `TF_VAR_REDIS_PASSWORD` in GitHub Secrets
4. Run deploy workflow (app restarts and reconnects with new password)

Schedule: every 180 days

---

## RabbitMQ Password

1. Update `TF_VAR_RABBITMQ_PASSWORD` in GitHub Secrets
2. Run `terraform apply` — AmazonMQ updates the user password
3. Run deploy workflow to pick up new connection URL

---

## API Keys (Resend, Gemini, Sentry, etc.)

Rotate on compromise only (no scheduled rotation). Steps:
1. Generate new key in the provider's dashboard
2. Update the corresponding GitHub Secret (`TF_VAR_RESEND_KEY`, etc.)
3. Run deploy workflow

---

## Rotation Schedule Summary

| Secret | Rotation | Trigger |
|---|---|---|
| ACCESS_TOKEN_SECRET | Every 90 days | Scheduled |
| REFRESH_TOKEN_SECRET | Every 90 days | Scheduled |
| DB passwords | Every 180 days | Scheduled |
| Redis password | Every 180 days | Scheduled |
| RabbitMQ password | Every 180 days | Scheduled |
| API keys (Resend, etc.) | On compromise | Incident |
