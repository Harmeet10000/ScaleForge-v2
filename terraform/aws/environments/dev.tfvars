# AWS dev environment — non-sensitive values only
# Secrets (db_password, rabbitmq_password, etc.) come from TF_VAR_* env vars

environment          = "dev"
aws_region           = "ap-south-1"

vpc_cidr             = "10.0.0.0/16"
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24"]

db_instance_class    = "db.t3.small"
db_allocated_storage = 20
db_username          = "sf2_dev"

redis_node_type      = "cache.t3.micro"
rabbitmq_instance_type = "mq.t3.micro"
rabbitmq_username    = "sf2_dev"

app_image            = "123456789.dkr.ecr.ap-south-1.amazonaws.com/scaleforge-v2:dev-latest"
app_cpu              = 256
app_memory           = 512
app_replica_count    = 1

# Backend config (used with -backend-config=environments/dev.tfvars)
# bucket         = "sf2-terraform-state-dev"
# region         = "ap-south-1"
# dynamodb_table = "sf2-terraform-locks-dev"
