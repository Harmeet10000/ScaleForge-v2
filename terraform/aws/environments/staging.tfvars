# AWS staging environment
environment          = "staging"
aws_region           = "ap-south-1"

vpc_cidr             = "10.1.0.0/16"
private_subnet_cidrs = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
public_subnet_cidrs  = ["10.1.101.0/24", "10.1.102.0/24", "10.1.103.0/24"]

db_instance_class    = "db.t3.medium"
db_allocated_storage = 50
db_username          = "sf2_staging"

redis_node_type        = "cache.t3.medium"
rabbitmq_instance_type = "mq.t3.micro"
rabbitmq_username      = "sf2_staging"

app_image          = "123456789.dkr.ecr.ap-south-1.amazonaws.com/scaleforge-v2:staging-latest"
app_cpu            = 512
app_memory         = 1024
app_replica_count  = 2

alarm_email        = "alerts-staging@yourcompany.com"

# Backend config
# bucket         = "sf2-terraform-state-staging"
# region         = "ap-south-1"
# dynamodb_table = "sf2-terraform-locks-staging"
