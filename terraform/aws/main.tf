##############################################################################
# ScaleForge-v2 — AWS Root Module
# Providers: aws, kubernetes, helm, random, cloudflare, datadog
##############################################################################

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.35"
    }
    datadog = {
      source  = "datadog/datadog"
      version = "~> 3.40"
    }
  }

  backend "s3" {
    # Configured via -backend-config=environments/<env>.tfvars at init time
    key            = "scaleforge-v2/terraform.tfstate"
    encrypt        = true
    use_lockfile   = true  # native S3 locking (TF 1.7+)
  }
}

##############################################################################
# Providers
##############################################################################

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "scaleforge-v2"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
  api_url = "https://api.datadoghq.com/"
}

##############################################################################
# Data sources
##############################################################################

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

##############################################################################
# Random suffix for globally unique names
##############################################################################

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix  = "sf2-${var.environment}"
  suffix       = random_id.suffix.hex
  account_id   = data.aws_caller_identity.current.account_id
  azs          = slice(data.aws_availability_zones.available.names, 0, 3)
}

##############################################################################
# Modules
##############################################################################

module "networking" {
  source = "../modules/networking"

  provider_type    = "aws"
  name_prefix      = local.name_prefix
  environment      = var.environment
  cidr_block       = var.vpc_cidr
  azs              = local.azs
  private_subnets  = var.private_subnet_cidrs
  public_subnets   = var.public_subnet_cidrs
}

module "database" {
  source = "../modules/database"

  provider_type        = "aws"
  name_prefix          = local.name_prefix
  environment          = var.environment
  subnet_ids           = module.networking.private_subnet_ids
  security_group_ids   = [module.networking.db_security_group_id]
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  db_name              = "scaleforge"
  db_username          = var.db_username
  db_password          = var.db_password
  multi_az             = var.environment == "prod" ? true : false
  deletion_protection  = var.environment == "prod" ? true : false
  backup_retention     = var.environment == "prod" ? 30 : 7
}

module "cache" {
  source = "../modules/cache"

  provider_type       = "aws"
  name_prefix         = local.name_prefix
  environment         = var.environment
  subnet_ids          = module.networking.private_subnet_ids
  security_group_ids  = [module.networking.cache_security_group_id]
  node_type           = var.redis_node_type
  num_cache_nodes     = var.environment == "prod" ? 3 : 1
  automatic_failover  = var.environment == "prod" ? true : false
}

module "queue" {
  source = "../modules/queue"

  provider_type      = "aws"
  name_prefix        = local.name_prefix
  environment        = var.environment
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.queue_security_group_id]
  instance_type      = var.rabbitmq_instance_type
  username           = var.rabbitmq_username
  password           = var.rabbitmq_password
}

module "storage" {
  source = "../modules/storage"

  provider_type = "aws"
  name_prefix   = "${local.name_prefix}-${local.suffix}"
  environment   = var.environment
  # Receipt PDFs: 7-year retention (legal requirement)
  lifecycle_rules = [
    {
      id      = "receipts-glacier"
      prefix  = "receipts/"
      enabled = true
      transition_days         = 90
      transition_storage_class = "GLACIER_IR"
      expiration_days         = 2555  # 7 years
    }
  ]
}

module "openfga" {
  source = "../modules/openfga"

  provider_type      = "aws"
  name_prefix        = local.name_prefix
  environment        = var.environment
  db_connection_url  = module.database.connection_url
  # OpenFGA runs as a sidecar / internal service — not publicly exposed
  internal_only      = true
  container_image    = "openfga/openfga:v1.5"
}

module "compute" {
  source = "../modules/compute"

  provider_type      = "aws"
  name_prefix        = local.name_prefix
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = [module.networking.app_security_group_id]

  # App container
  app_image          = var.app_image
  app_cpu            = var.app_cpu
  app_memory         = var.app_memory
  app_desired_count  = var.app_replica_count
  app_min_count      = var.environment == "prod" ? 2 : 1
  app_max_count      = var.environment == "prod" ? 10 : 3

  environment_vars = {
    NODE_ENV                 = var.environment
    PORT                     = "3000"
    POSTGRES_DATABASE_URL    = module.database.connection_url
    REDIS_URL                = module.cache.connection_url
    RABBITMQ_URL             = module.queue.connection_url
    AWS_S3_BUCKET            = module.storage.bucket_name
    OPENFGA_API_URL          = module.openfga.internal_url
    OPENFGA_STORE_ID         = var.openfga_store_id
    FLAME_ENABLED            = var.environment == "prod" ? "false" : "true"
  }
}

module "workers" {
  source = "../modules/workers"

  provider_type      = "aws"
  name_prefix        = local.name_prefix
  environment        = var.environment
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.private_subnet_ids
  app_image          = var.app_image

  workers = {
    pdf-worker = {
      cpu        = 1024
      memory     = 2048
      desired    = var.environment == "prod" ? 2 : 1
      command    = ["bun", "src/workers/pdfWorker.ts"]
    }
    cdc-worker = {
      cpu        = 512
      memory     = 1024
      desired    = 1
      command    = ["bun", "src/workers/cdcWorker.ts"]
    }
    email-worker = {
      cpu        = 256
      memory     = 512
      desired    = var.environment == "prod" ? 2 : 1
      command    = ["bun", "src/workers/emailWorker.ts"]
    }
  }

  environment_vars = {
    NODE_ENV              = var.environment
    POSTGRES_DATABASE_URL = module.database.connection_url
    REDIS_URL             = module.cache.connection_url
    RABBITMQ_URL          = module.queue.connection_url
    AWS_S3_BUCKET         = module.storage.bucket_name
  }
}

module "monitoring" {
  source = "../modules/monitoring"

  provider_type       = "aws"
  name_prefix         = local.name_prefix
  environment         = var.environment
  log_retention_days  = var.environment == "prod" ? 90 : 14
  alarm_email         = var.alarm_email

  # Datadog integration (staging + prod only)
  datadog_enabled     = var.environment != "dev"
  datadog_api_key     = var.datadog_api_key
}

##############################################################################
# Cloudflare DNS + WAF (staging + prod)
##############################################################################

resource "cloudflare_record" "api" {
  count   = var.environment != "dev" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.environment == "prod" ? "api" : "api-${var.environment}"
  type    = "CNAME"
  value   = module.compute.load_balancer_dns
  proxied = true
}

resource "cloudflare_ruleset" "waf" {
  count   = var.environment == "prod" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "ScaleForge WAF"
  kind    = "zone"
  phase   = "http_request_firewall_managed"

  rules {
    action = "execute"
    action_parameters {
      id = "efb7b8c949ac4650a09736fc376e9aee"  # Cloudflare Managed Ruleset
    }
    expression  = "true"
    description = "Cloudflare Managed Ruleset"
    enabled     = true
  }
}

##############################################################################
# Outputs
##############################################################################

output "app_url" {
  value = var.environment != "dev" ? "https://${cloudflare_record.api[0].hostname}" : "http://${module.compute.load_balancer_dns}"
}

output "db_connection_url" {
  value     = module.database.connection_url
  sensitive = true
}

output "redis_url" {
  value     = module.cache.connection_url
  sensitive = true
}

output "s3_bucket" {
  value = module.storage.bucket_name
}
