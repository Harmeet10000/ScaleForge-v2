##############################################################################
# ScaleForge-v2 — GCP Root Module
# Providers: google, kubernetes, helm, random, cloudflare, datadog
##############################################################################

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.30"
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

  backend "gcs" {
    # Configured via -backend-config at init
    # bucket = "sf2-terraform-state-<env>"
    prefix = "scaleforge-v2/terraform.tfstate"
  }
}

##############################################################################
# Providers
##############################################################################

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "google-beta" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
}

##############################################################################
# Locals
##############################################################################

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  name_prefix = "sf2-${var.environment}"
  suffix      = random_id.suffix.hex
}

##############################################################################
# Enable required GCP APIs
##############################################################################

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sql-component.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "containerregistry.googleapis.com",
    "artifactregistry.googleapis.com",
    "servicenetworking.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

##############################################################################
# VPC
##############################################################################

resource "google_compute_network" "vpc" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "private" {
  name          = "${local.name_prefix}-private"
  ip_cidr_range = var.subnet_cidr
  region        = var.gcp_region
  network       = google_compute_network.vpc.id

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Private services access (for Cloud SQL, Memorystore)
resource "google_compute_global_address" "private_ip_range" {
  name          = "${local.name_prefix}-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
  depends_on              = [google_project_service.apis]
}

##############################################################################
# Cloud SQL (PostgreSQL)
##############################################################################

resource "google_sql_database_instance" "postgres" {
  name             = "${local.name_prefix}-pg-${local.suffix}"
  database_version = "POSTGRES_16"
  region           = var.gcp_region

  deletion_protection = var.environment == "prod" ? true : false

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = var.db_disk_size

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = var.environment == "prod" ? true : false
      transaction_log_retention_days = var.environment == "prod" ? 7 : 1
      backup_retention_settings {
        retained_backups = var.environment == "prod" ? 30 : 7
      }
    }

    maintenance_window {
      day  = 7  # Sunday
      hour = 3
    }

    database_flags {
      name  = "max_connections"
      value = var.environment == "prod" ? "200" : "50"
    }
  }

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "scaleforge" {
  name     = "scaleforge"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_database" "openfga_schema" {
  # OpenFGA uses same instance, separate DB (acts as schema isolation on Cloud SQL)
  name     = "openfga"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app_user" {
  name     = var.db_username
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

##############################################################################
# Memorystore (Redis)
##############################################################################

resource "google_redis_instance" "cache" {
  name           = "${local.name_prefix}-redis"
  tier           = var.environment == "prod" ? "STANDARD_HA" : "BASIC"
  memory_size_gb = var.redis_memory_gb
  region         = var.gcp_region

  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version     = "REDIS_7_0"
  display_name      = "ScaleForge ${var.environment} Redis"
  reserved_ip_range = var.redis_reserved_ip_range

  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

##############################################################################
# Cloud Storage (receipts, assets)
##############################################################################

resource "google_storage_bucket" "receipts" {
  name                        = "${local.name_prefix}-receipts-${local.suffix}"
  location                    = var.gcp_region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition { age = 90 }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition { age = 365 }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      age    = 2555  # 7 years
      with_state = "ANY"
    }
    action { type = "Delete" }
  }
}

##############################################################################
# Cloud Run (App + Workers)
##############################################################################

resource "google_cloud_run_v2_service" "app" {
  name     = "${local.name_prefix}-app"
  location = var.gcp_region

  template {
    scaling {
      min_instance_count = var.environment == "prod" ? 2 : 0
      max_instance_count = var.environment == "prod" ? 20 : 5
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.private.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.app_image

      resources {
        limits = {
          cpu    = var.app_cpu
          memory = var.app_memory
        }
        cpu_idle          = var.environment != "prod"
        startup_cpu_boost = true
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name = "POSTGRES_DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_url.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.receipts.name
      }
      env {
        name  = "FLAME_ENABLED"
        value = var.environment == "prod" ? "false" : "true"
      }

      ports {
        container_port = 3000
      }

      startup_probe {
        http_get {
          path = "/api/v1/health/self"
          port = 3000
        }
        initial_delay_seconds = 10
        period_seconds        = 5
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/api/v1/health/self"
          port = 3000
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Workers as separate Cloud Run Jobs
resource "google_cloud_run_v2_job" "pdf_worker" {
  name     = "${local.name_prefix}-pdf-worker"
  location = var.gcp_region

  template {
    template {
      containers {
        image   = var.app_image
        command = ["bun", "src/workers/pdfWorker.ts"]

        resources {
          limits = {
            cpu    = "2"
            memory = "2Gi"
          }
        }
      }
      max_retries = 3
    }
  }
}

##############################################################################
# Secret Manager (store connection strings)
##############################################################################

resource "google_secret_manager_secret" "db_url" {
  secret_id = "${local.name_prefix}-db-url"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "db_url" {
  secret      = google_secret_manager_secret.db_url.id
  secret_data = "postgresql://${var.db_username}:${var.db_password}@${google_sql_database_instance.postgres.private_ip_address}/scaleforge"
}

resource "google_secret_manager_secret" "redis_url" {
  secret_id = "${local.name_prefix}-redis-url"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret      = google_secret_manager_secret.redis_url.id
  secret_data = "rediss://:${google_redis_instance.cache.auth_string}@${google_redis_instance.cache.host}:${google_redis_instance.cache.port}"
}

##############################################################################
# Outputs
##############################################################################

output "app_url" {
  value = google_cloud_run_v2_service.app.uri
}

output "db_private_ip" {
  value     = google_sql_database_instance.postgres.private_ip_address
  sensitive = true
}

output "redis_host" {
  value     = google_redis_instance.cache.host
  sensitive = true
}

output "gcs_bucket" {
  value = google_storage_bucket.receipts.name
}
