variable "environment"          { type = string }
variable "azure_location"       { type = string; default = "Central India" }
variable "vnet_cidr"            { type = string; default = "10.20.0.0/16" }
variable "private_subnet_cidr"  { type = string; default = "10.20.1.0/24" }
variable "db_subnet_cidr"       { type = string; default = "10.20.2.0/24" }
variable "db_sku"               { type = string }   # dev: B_Standard_B1ms  staging: GP_Standard_D2s_v3  prod: GP_Standard_D4s_v3
variable "db_storage_mb"        { type = number; default = 32768 }
variable "db_username"          { type = string; sensitive = true }
variable "db_password"          { type = string; sensitive = true }
variable "redis_capacity"       { type = number; default = 1 }
variable "app_image"            { type = string }
variable "app_cpu"              { type = number; default = 0.5 }
variable "app_memory"           { type = string; default = "1Gi" }
variable "cloudflare_api_token" { type = string; sensitive = true; default = "" }
variable "cloudflare_zone_id"   { type = string; default = "" }
variable "datadog_api_key"      { type = string; sensitive = true; default = "" }
variable "datadog_app_key"      { type = string; sensitive = true; default = "" }
