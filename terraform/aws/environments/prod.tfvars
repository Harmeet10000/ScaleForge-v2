# AWS prod environment — HA configuration
environment          = "prod"
aws_region           = "ap-south-1"

vpc_cidr             = "10.2.0.0/16"
private_subnet_cidrs = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
public_subnet_cidrs  = ["10.2.101.0/24", "10.2.102.0/24", "10.2.103.0/24"]

db_instance_class    = "db.r6g.large"
db_allocated_storage = 100
db_username          = "sf2_prod"

redis_node_type        = "cache.r6g.large"
rabbitmq_instance_type = "mq.m5.large"
rabbitmq_username      = "sf2_prod"

app_image          = "123456789.dkr.ecr.ap-south-1.amazonaws.com/scaleforge-v2:prod-latest"
app_cpu            = 1024
app_memory         = 2048
app_replica_count  = 3

alarm_email        = "alerts-prod@yourcompany.com"

# Backend config
# bucket         = "sf2-terraform-state-prod"
# region         = "ap-south-1"
# dynamodb_table = "sf2-terraform-locks-prod"
