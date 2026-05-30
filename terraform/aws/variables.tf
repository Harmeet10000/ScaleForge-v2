##############################################################################
# AWS — Input Variables
##############################################################################

variable "environment" {
  description = "Deployment environment: dev | staging | prod"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"  # Mumbai — closest to India-based users
}

# ─── Networking ───────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# ─── Database ────────────────────────────────────────────────────────────────

variable "db_instance_class" {
  type    = string
  # dev: db.t3.small  staging: db.t3.medium  prod: db.r6g.large
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_username" {
  type      = string
  sensitive = true
}

variable "db_password" {
  type      = string
  sensitive = true
}

# ─── Cache ────────────────────────────────────────────────────────────────────

variable "redis_node_type" {
  type    = string
  # dev: cache.t3.micro  staging: cache.t3.medium  prod: cache.r6g.large
}

# ─── Queue ────────────────────────────────────────────────────────────────────

variable "rabbitmq_instance_type" {
  type    = string
  default = "mq.t3.micro"  # prod: mq.m5.large
}

variable "rabbitmq_username" {
  type      = string
  default   = "scaleforge"
  sensitive = true
}

variable "rabbitmq_password" {
  type      = string
  sensitive = true
}

# ─── Compute ──────────────────────────────────────────────────────────────────

variable "app_image" {
  description = "Docker image URI (ECR)"
  type        = string
}

variable "app_cpu" {
  type    = number
  default = 512  # prod: 1024
}

variable "app_memory" {
  type    = number
  default = 1024  # prod: 2048
}

variable "app_replica_count" {
  type    = number
  default = 1  # staging: 2  prod: 3
}

# ─── OpenFGA ──────────────────────────────────────────────────────────────────

variable "openfga_store_id" {
  type      = string
  sensitive = true
}

# ─── Cloudflare ───────────────────────────────────────────────────────────────

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "cloudflare_zone_id" {
  type    = string
  default = ""
}

# ─── Monitoring ───────────────────────────────────────────────────────────────

variable "alarm_email" {
  type    = string
  default = ""
}

variable "datadog_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "datadog_app_key" {
  type      = string
  sensitive = true
  default   = ""
}
