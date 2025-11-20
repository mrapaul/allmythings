aws_region = "us-east-1"
project_name = "visual-inventory"
environment = "prod"

# VPC Configuration
vpc_cidr = "10.2.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
private_subnet_cidr = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
public_subnet_cidr = ["10.2.101.0/24", "10.2.102.0/24", "10.2.103.0/24"]

# Database Configuration
db_name = "visual_inventory_prod"
db_username = "postgres"
db_instance_class = "db.t3.medium"
db_allocated_storage = 100
db_engine_version = "16.1"
db_backup_retention_period = 30
db_multi_az = true

# Redis Configuration
redis_engine_version = "7.0"
redis_node_type = "cache.t3.medium"
redis_num_cache_nodes = 3

# ECS Configuration
ecs_min_capacity = 3
ecs_max_capacity = 20
task_cpu = "1024"
task_memory = "2048"

# HTTPS Configuration
enable_https = true
certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"

# Logging
log_retention_days = 30

# Ensemble Configuration
ensemble_confidence_threshold = "0.8"
provider_timeout_ms = "6000"
nms_iou_threshold = "0.5"
