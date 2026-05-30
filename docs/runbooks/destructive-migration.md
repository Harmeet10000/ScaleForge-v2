# Destructive Migration Runbook

Destructive schema changes (drop column, rename column, change type, drop table) cannot
run through the automated CI gate. Follow this runbook instead.

## What counts as destructive

- `DROP COLUMN` / `DROP TABLE`
- `RENAME COLUMN` / `RENAME TABLE`
- Changing a column type (e.g. `text` → `integer`)
- Adding a `NOT NULL` constraint to an existing column without a default
- Removing a unique or foreign-key constraint

## Steps

### 1. Announce maintenance window

Post in #engineering: expected downtime, what is changing, expected duration.

### 2. Scale down the application

```bash
# AWS ECS
aws ecs update-service \
  --cluster scaleforge-prod \
  --service scaleforge-api \
  --desired-count 0

# GCP Cloud Run
gcloud run services update scaleforge-api --min-instances 0 --region us-central1
```

### 3. Take a manual database snapshot

```bash
# RDS
aws rds create-db-snapshot \
  --db-instance-identifier scaleforge-prod \
  --db-snapshot-identifier "pre-destructive-migration-$(date +%Y%m%d%H%M%S)"

# Neon (via console or CLI)
# Dashboard → Project → Branches → main → Restore point
```

### 4. Run the migration

```bash
POSTGRES_DATABASE_URL="<prod-url>" bunx drizzle-kit migrate
```

### 5. Verify the schema

```bash
POSTGRES_DATABASE_URL="<prod-url>" bunx drizzle-kit check
```

### 6. Restore desired count and monitor

```bash
aws ecs update-service \
  --cluster scaleforge-prod \
  --service scaleforge-api \
  --desired-count 2
```

Watch Datadog / CloudWatch for error rate spikes for 10 minutes.

### 7. Rollback (if migration causes errors)

```bash
# Restore from the snapshot taken in step 3
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier scaleforge-prod-restored \
  --db-snapshot-identifier "pre-destructive-migration-<timestamp>"
```

Update `POSTGRES_DATABASE_URL` to point to the restored instance.

## After the migration

- Delete the snapshot after 72 hours if no rollback was needed
- Update any application code that referenced the changed column/table
- Close the maintenance window announcement
