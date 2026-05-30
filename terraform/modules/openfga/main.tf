##############################################################################
# Module: openfga
# Deploys self-hosted OpenFGA against the project's own PostgreSQL database.
# OpenFGA is an internal-only service — never publicly exposed.
#
# Usage (AWS ECS example):
#   module "openfga" {
#     source            = "../modules/openfga"
#     provider_type     = "aws"
#     name_prefix       = "sf2-dev"
#     environment       = "dev"
#     db_connection_url = "postgresql://user:pass@host/openfga"
#     container_image   = "openfga/openfga:v1.5"
#     internal_only     = true
#   }
##############################################################################

variable "provider_type"     { type = string }
variable "name_prefix"       { type = string }
variable "environment"       { type = string }
variable "db_connection_url" { type = string; sensitive = true }
variable "container_image"   { type = string; default = "openfga/openfga:v1.5" }
variable "internal_only"     { type = bool;   default = true }
variable "http_port"         { type = number; default = 8080 }
variable "grpc_port"         { type = number; default = 8081 }

# The bootstrap command to run once:
#   docker run --rm openfga/openfga:v1.5 migrate \
#     --datastore-engine postgres \
#     --datastore-uri "postgresql://..."
#
# This module does NOT run migrations automatically.
# Run migrations manually or in a CI step before first deploy.

output "internal_url" {
  # Callers use this to set OPENFGA_API_URL in the app environment
  value       = "http://${var.name_prefix}-openfga:${var.http_port}"
  description = "Internal HTTP URL for OpenFGA (app container to OpenFGA)"
}

output "grpc_url" {
  value       = "${var.name_prefix}-openfga:${var.grpc_port}"
  description = "Internal gRPC address for OpenFGA"
}

# NOTE: Provider-specific resources (ECS task, Cloud Run service, Container App)
# are implemented in each provider's main.tf using these outputs as reference.
# This module provides the shared configuration contract.
