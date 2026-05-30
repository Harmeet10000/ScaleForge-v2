variable "environment"       { type = string }
variable "gcp_project_id"    { type = string }
variable "gcp_region"        { type = string; default = "asia-south1" }
variable "subnet_cidr"       { type = string; default = "10.10.0.0/24" }
variable "db_tier"           { type = string }  # dev: db-f1-micro  staging: db-n1-standard-1  prod: db-n1-standard-4
variable "db_disk_size"      { type = number; default = 20 }
variable "db_username"       { type = string; sensitive = true }
variable "db_password"       { type = string; sensitive = true }
variable "redis_memory_gb"   { type = number; default = 1 }
variable "redis_reserved_ip_range" { type = string; default = "10.10.1.0/29" }
variable "app_image"         { type = string }
variable "app_cpu"           { type = string; default = "1" }
variable "app_memory"        { type = string; default = "512Mi" }
variable "cloudflare_api_token" { type = string; sensitive = true; default = "" }
variable "cloudflare_zone_id"   { type = string; default = "" }
variable "datadog_api_key"      { type = string; sensitive = true; default = "" }
variable "datadog_app_key"      { type = string; sensitive = true; default = "" }
