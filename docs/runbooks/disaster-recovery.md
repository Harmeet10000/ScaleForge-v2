# ScaleForge Disaster Recovery Plan

## RTO / RPO Targets

| Component | RTO (time to recover) | RPO (max data loss) |
|---|---|---|
| API Server (ECS) | < 5 minutes | N/A — stateless |
| MongoDB (Atlas) | < 30 minutes | < 5 minutes (continuous backup) |
| PostgreSQL (Neon/RDS) | < 30 minutes | < 5 minutes (PITR enabled) |
| Redis (ElastiCache) | < 15 minutes | 0 — cache, no RPO required |
| RabbitMQ (AmazonMQ) | < 30 minutes | < 5 minutes (durable queues) |
| S3 Receipts | N/A | 0 — cross-region replication |

---

## Failure Scenarios

### 1. ECS task crash loop

**Signal:** Datadog alert — `ecs.service.running < desired`, or HTTP 502/503 error rate spike.

**Steps:**
```bash
# Check task stop reason
aws ecs describe-tasks \
  --cluster scaleforge-prod \
  --tasks $(aws ecs list-tasks --cluster scaleforge-prod --query 'taskArns[0]' --output text)

# Force new deployment (pulls latest image)
aws ecs update-service \
  --cluster scaleforge-prod \
  --service scaleforge-api \
  --force-new-deployment

# If image is broken, roll back to previous SHA
# Update image_tag in Terraform and re-apply
```

See: [ecs-recovery.md](./ecs-recovery.md)

---

### 2. MongoDB Atlas primary failure

Atlas handles automatic failover to a replica set member in < 30 seconds.

**No manual action required** for single-node failure.

**Verify recovery:**
```javascript
// In mongosh against prod URI
db.adminCommand({ replSetGetStatus: 1 })
```

**If Atlas shows no primary after 60 seconds:**
1. Check Atlas dashboard → Clusters → Metrics
2. Open an Atlas support ticket if cluster is unresponsive

---

### 3. PostgreSQL data corruption (Neon)

Neon PITR gives 5-minute granularity in production.

```bash
# Via Neon CLI — restore to a point before the corruption
neon branches restore main \
  --source-branch main \
  --timestamp "2026-05-30T15:00:00Z"

# Or via Neon Console:
# Dashboard → Project → Branches → main → Restore → select timestamp
```

**After restore:**
1. Update `POSTGRES_DATABASE_URL` if branch URL changed
2. Run `bun run db:migrate` to re-apply any migrations that landed after the restore point
3. Run smoke tests

---

### 4. Full AWS us-east-1 region failure

GCP and Azure Terraform configs are maintained as hot standby.

**Steps:**
```bash
# 1. Point DNS to GCP Cloud Run (Cloudflare DNS)
# Cloudflare Dashboard → DNS → scaleforge.dev A record → update to GCP IP

# 2. Deploy to GCP
cd terraform/gcp
terraform init
TF_VAR_image_tag=<last-good-sha> terraform apply

# 3. Verify health
curl https://scaleforge.dev/api/v1/health
```

**Expected RTO: < 1 hour**

---

### 5. Redis cache failure (ElastiCache)

Redis is cache-only — a failure causes performance degradation, not data loss.

**Immediate:** Application continues with higher DB load (LRU caches miss, queries hit DB directly).

**Recovery:**
```bash
# Reboot the ElastiCache node
aws elasticache reboot-cache-cluster \
  --cache-cluster-id scaleforge-prod-redis \
  --cache-node-ids-to-reboot 0001

# If node is unrecoverable, Terraform will provision a new one
cd terraform/aws && terraform apply
```

---

## Backup Schedule

| Data | Mechanism | Frequency | Retention |
|---|---|---|---|
| MongoDB | Atlas continuous + daily snapshot | Continuous | 7 days rolling |
| PostgreSQL | Neon PITR | Continuous | 30 days |
| S3 receipts | Cross-region replication (us-west-2) | Real-time | 7 years lifecycle |
| RabbitMQ | Durable queue persistence | Per-message | Until consumed |
| Redis | AOF + RDB snapshots | Every 60s | Last 3 snapshots |

---

## Contacts & Escalation

1. **On-call engineer** — PagerDuty rotation
2. **MongoDB Atlas support** — Atlas support portal (Priority support tier)
3. **Neon support** — support@neon.tech
4. **AWS support** — AWS console support case (Business/Enterprise tier)
