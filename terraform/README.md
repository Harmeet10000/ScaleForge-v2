# ScaleForge-v2 — Terraform Infrastructure

Multi-cloud Infrastructure as Code for **AWS**, **GCP**, and **Azure**.  
Each provider has three environments: `dev`, `staging`, `prod`.

## Structure

```
terraform/
  modules/              # Reusable modules (provider-agnostic interfaces)
    networking/         # VPC / VNet / subnets / security groups
    compute/            # App container runtime (ECS / Cloud Run / Container Apps)
    database/           # PostgreSQL (RDS / Cloud SQL / Flexible Server)
    cache/              # Redis (ElastiCache / Memorystore / Azure Cache)
    queue/              # RabbitMQ (AmazonMQ / CloudAMQP on GCP / Azure Service Bus)
    storage/            # Object storage (S3 / GCS / Azure Blob)
    openfga/            # Self-hosted OpenFGA container + PG schema migration
    monitoring/         # Metrics, logs, alerts (CloudWatch / Cloud Logging / Azure Monitor)
    workers/            # Background job worker containers (PDF, CDC, email)
  aws/                  # AWS provider root module
    environments/
      dev.tfvars
      staging.tfvars
      prod.tfvars
    main.tf
    variables.tf
    outputs.tf
    backend.tf          # S3 + DynamoDB state backend
  gcp/                  # GCP provider root module
    environments/
      dev.tfvars
      staging.tfvars
      prod.tfvars
    main.tf
    variables.tf
    outputs.tf
    backend.tf          # GCS state backend
  azure/                # Azure provider root module
    environments/
      dev.tfvars
      staging.tfvars
      prod.tfvars
    main.tf
    variables.tf
    outputs.tf
    backend.tf          # Azure Blob Storage state backend
```

## Usage

```bash
# AWS — dev
cd terraform/aws
terraform init -backend-config=environments/dev.tfvars
terraform workspace select dev || terraform workspace new dev
terraform plan  -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars

# GCP — staging
cd terraform/gcp
terraform init -backend-config=environments/staging.tfvars
terraform workspace select staging || terraform workspace new staging
terraform plan  -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars

# Azure — prod
cd terraform/azure
terraform init -backend-config=environments/prod.tfvars
terraform workspace select prod || terraform workspace new prod
terraform plan  -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

## Provider Plugins Used

| Plugin | Purpose |
|---|---|
| `hashicorp/aws` | AWS resources |
| `hashicorp/google` | GCP resources |
| `hashicorp/azurerm` | Azure resources |
| `hashicorp/kubernetes` | K8s manifests (all 3 clouds via EKS/GKE/AKS) |
| `hashicorp/helm` | Helm chart releases (cert-manager, ingress-nginx, OpenFGA) |
| `hashicorp/random` | Unique suffix generation for globally unique bucket/DB names |
| `hashicorp/tls` | TLS cert + key generation for internal mTLS |
| `hashicorp/vault` | HashiCorp Vault secret injection (optional; can swap with cloud-native) |
| `cloudflare/cloudflare` | DNS records, WAF rules, CDN, Zero Trust access |
| `datadog/datadog` | Datadog monitors, dashboards, SLOs (staging + prod) |
| `grafana/grafana` | Grafana dashboards as code (dev + staging) |
| `1password/onepassword` | Pull secrets from 1Password into Terraform data sources |

## Environment Matrix

| Environment | Scale | DB size | Redis | Workers | Replicas | Cost target |
|---|---|---|---|---|---|---|
| dev | Minimal | db.t3.small / db-f1-micro | cache.t3.micro | 1 replica each | 1 | < $50/mo |
| staging | Production-like | db.t3.medium / db-n1-standard-1 | cache.t3.medium | 2 replicas | 2 | < $200/mo |
| prod | HA | db.r6g.large / db-n1-standard-4 | cache.r6g.large | 3 replicas | 3+ + autoscale | Cost-optimized HA |

## Secrets Strategy

All secrets are **never stored in `.tfvars` files**. They are sourced from:
1. **Dev**: environment variables (`TF_VAR_*`) or `.env.local` (gitignored)
2. **Staging/Prod**: 1Password CLI → `op inject` → `TF_VAR_*` at CI time
3. **Vault** (optional v2): Vault dynamic secrets for DB credentials

## State Locking

| Provider | Backend | Lock |
|---|---|---|
| AWS | S3 bucket + DynamoDB table | DynamoDB conditional writes |
| GCP | GCS bucket | GCS object versioning |
| Azure | Azure Blob Storage | Lease-based locking |
