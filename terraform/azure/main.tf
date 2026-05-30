##############################################################################
# ScaleForge-v2 — Azure Root Module
# Providers: azurerm, kubernetes, helm, random, cloudflare, datadog
##############################################################################

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.105"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.50"
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
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.35"
    }
    datadog = {
      source  = "datadog/datadog"
      version = "~> 3.40"
    }
  }

  backend "azurerm" {
    # Configured via -backend-config at init
    # resource_group_name  = "sf2-tfstate-<env>"
    # storage_account_name = "sf2tfstate<env>"
    # container_name       = "tfstate"
    key = "scaleforge-v2.terraform.tfstate"
  }
}

##############################################################################
# Providers
##############################################################################

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = var.environment == "prod" ? true : false
    }
    key_vault {
      purge_soft_delete_on_destroy    = var.environment != "prod"
      recover_soft_deleted_key_vaults = true
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
}

##############################################################################
# Resource Group & Locals
##############################################################################

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix = "sf2${var.environment}"  # Azure: no hyphens in storage account names
  suffix      = random_id.suffix.hex
  rg_name     = "sf2-${var.environment}-rg"
  location    = var.azure_location
}

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = local.location

  tags = {
    Project     = "scaleforge-v2"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

##############################################################################
# Virtual Network
##############################################################################

resource "azurerm_virtual_network" "main" {
  name                = "${local.name_prefix}-vnet"
  address_space       = [var.vnet_cidr]
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_subnet" "private" {
  name                 = "${local.name_prefix}-private-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.private_subnet_cidr]

  service_endpoints = ["Microsoft.Sql", "Microsoft.Storage"]

  delegation {
    name = "container-apps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "db" {
  name                 = "${local.name_prefix}-db-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.db_subnet_cidr]

  delegation {
    name = "postgres-flexible"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

##############################################################################
# PostgreSQL Flexible Server
##############################################################################

resource "azurerm_private_dns_zone" "postgres" {
  name                = "${local.name_prefix}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "${local.name_prefix}-pg-dns-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  resource_group_name   = azurerm_resource_group.main.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                   = "${local.name_prefix}-pg-${local.suffix}"
  resource_group_name    = azurerm_resource_group.main.name
  location               = local.location
  version                = "16"
  delegated_subnet_id    = azurerm_subnet.db.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres.id

  administrator_login    = var.db_username
  administrator_password = var.db_password

  sku_name   = var.db_sku
  storage_mb = var.db_storage_mb

  high_availability {
    mode = var.environment == "prod" ? "ZoneRedundant" : "Disabled"
  }

  backup_retention_days        = var.environment == "prod" ? 35 : 7
  geo_redundant_backup_enabled = var.environment == "prod" ? true : false

  maintenance_window {
    day_of_week  = 0  # Sunday
    start_hour   = 3
    start_minute = 0
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "scaleforge" {
  name      = "scaleforge"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

resource "azurerm_postgresql_flexible_server_database" "openfga" {
  # OpenFGA on own PostgreSQL — separate DB on same server
  name      = "openfga"
  server_id = azurerm_postgresql_flexible_server.main.id
  collation = "en_US.utf8"
  charset   = "utf8"
}

##############################################################################
# Azure Cache for Redis
##############################################################################

resource "azurerm_redis_cache" "main" {
  name                = "${local.name_prefix}-redis-${local.suffix}"
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  capacity            = var.redis_capacity
  family              = var.environment == "prod" ? "P" : "C"
  sku_name            = var.environment == "prod" ? "Premium" : "Standard"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"

  redis_configuration {
    enable_authentication = true
    maxmemory_policy      = "allkeys-lru"  # LRU eviction — matches lru-cache strategy
  }
}

##############################################################################
# Azure Storage Account (receipts + assets)
##############################################################################

resource "azurerm_storage_account" "main" {
  name                     = "${local.name_prefix}storage${local.suffix}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = local.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "prod" ? "GRS" : "LRS"
  min_tls_version          = "TLS1_2"

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = var.environment == "prod" ? 30 : 7
    }
  }
}

resource "azurerm_storage_container" "receipts" {
  name                  = "receipts"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "receipts_lifecycle" {
  storage_account_id = azurerm_storage_account.main.id

  rule {
    name    = "receipts-archive"
    enabled = true
    filters {
      prefix_match = ["receipts/"]
      blob_types   = ["blockBlob"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = 90
        tier_to_archive_after_days_since_modification_greater_than = 365
        delete_after_days_since_modification_greater_than          = 2555  # 7 years
      }
    }
  }
}

##############################################################################
# Container Apps Environment (App + Workers)
##############################################################################

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${local.name_prefix}-logs"
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.environment == "prod" ? 90 : 30
}

resource "azurerm_container_app_environment" "main" {
  name                       = "${local.name_prefix}-cae"
  location                   = local.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.private.id
}

resource "azurerm_container_app" "api" {
  name                         = "${local.name_prefix}-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  template {
    min_replicas = var.environment == "prod" ? 2 : 0
    max_replicas = var.environment == "prod" ? 20 : 5

    container {
      name   = "api"
      image  = var.app_image
      cpu    = var.app_cpu
      memory = var.app_memory

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name        = "POSTGRES_DATABASE_URL"
        secret_name = "db-url"
      }
      env {
        name        = "REDIS_URL"
        secret_name = "redis-url"
      }
      env {
        name  = "AZURE_STORAGE_CONTAINER"
        value = azurerm_storage_container.receipts.name
      }
      env {
        name  = "FLAME_ENABLED"
        value = var.environment == "prod" ? "false" : "true"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/api/v1/health/self"
        port      = 3000
        initial_delay = 15
        period_seconds = 30
      }

      readiness_probe {
        transport = "HTTP"
        path      = "/api/v1/health/self"
        port      = 3000
        period_seconds = 10
      }
    }
  }

  secret {
    name  = "db-url"
    value = "postgresql://${var.db_username}:${var.db_password}@${azurerm_postgresql_flexible_server.main.fqdn}/scaleforge?sslmode=require"
  }

  secret {
    name  = "redis-url"
    value = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:${azurerm_redis_cache.main.ssl_port}"
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

# PDF worker as separate Container App Job
resource "azurerm_container_app_job" "pdf_worker" {
  name                         = "${local.name_prefix}-pdf-worker"
  location                     = local.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id

  replica_timeout_in_seconds = 600
  replica_retry_limit        = 3

  event_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  template {
    container {
      name    = "pdf-worker"
      image   = var.app_image
      cpu     = 2.0
      memory  = "4Gi"
      command = ["bun", "src/workers/pdfWorker.ts"]
    }
  }
}

##############################################################################
# Key Vault (secrets management)
##############################################################################

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                = "${local.name_prefix}-kv-${local.suffix}"
  location            = local.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  soft_delete_retention_days = var.environment == "prod" ? 90 : 7
  purge_protection_enabled   = var.environment == "prod" ? true : false

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = ["Get", "List", "Set", "Delete", "Purge"]
  }
}

##############################################################################
# Outputs
##############################################################################

output "app_fqdn" {
  value = azurerm_container_app.api.latest_revision_fqdn
}

output "db_fqdn" {
  value     = azurerm_postgresql_flexible_server.main.fqdn
  sensitive = true
}

output "redis_hostname" {
  value     = azurerm_redis_cache.main.hostname
  sensitive = true
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}
