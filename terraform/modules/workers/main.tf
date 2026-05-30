##############################################################################
# Module: workers
# Background job workers: pdf-worker, cdc-worker, email-worker, renewal-worker
#
# Each worker runs the same Docker image as the API but with a different CMD.
# Worker sizing is independent of the API (PDF worker needs more RAM for PDF gen).
#
# Uses @platformatic/job-queue PostgreSQL backend — no separate queue infra needed.
##############################################################################

variable "provider_type"    { type = string }
variable "name_prefix"      { type = string }
variable "environment"      { type = string }
variable "vpc_id"           { type = string; default = "" }
variable "subnet_ids"       { type = list(string); default = [] }
variable "app_image"        { type = string }
variable "environment_vars" { type = map(string); default = {} }

variable "workers" {
  description = "Map of worker name → config"
  type = map(object({
    cpu     = number
    memory  = number
    desired = number
    command = list(string)
  }))
  default = {
    pdf-worker = {
      cpu     = 1024
      memory  = 2048
      desired = 1
      command = ["bun", "src/workers/pdfWorker.ts"]
    }
    cdc-worker = {
      cpu     = 512
      memory  = 1024
      desired = 1
      command = ["bun", "src/workers/cdcWorker.ts"]
    }
    email-worker = {
      cpu     = 256
      memory  = 512
      desired = 1
      command = ["bun", "src/workers/emailWorker.ts"]
    }
    renewal-worker = {
      cpu     = 256
      memory  = 512
      desired = 1
      command = ["bun", "src/workers/renewalWorker.ts"]
    }
  }
}

# Worker-specific environment variables on top of shared vars:
# WORKER_TYPE  — set to the worker name for log filtering
# FLAME_ENABLED — always false for workers (flame graphs for API only)
locals {
  worker_extra_env = {
    FLAME_ENABLED = "false"
  }
}

output "worker_names" {
  value = keys(var.workers)
}
