aws_region = "us-east-1"
project_name = "visual-inventory"
environment = "staging"

# VPC Configuration
vpc_cidr = "10.1.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]
private_subnet_cidr = ["10.1.1.0/24", "10.1.2.0/24"]
public_subnet_cidr = ["10.1.101.0/24", "10.1.102.0/24"]

# Database Configuration
db_name = "visual_inventory_staging"
db_username = "postgres"
db_instance_class = "db.t3.small"
db_allocated_storage = 50
db_engine_version = "16.1"
db_backup_retention_period = 14
db_multi_az = true

# Redis Configuration
redis_engine_version = "7.0"
redis_node_type = "cache.t3.small"
redis_num_cache_nodes = 2

# ECS Configuration
ecs_min_capacity = 2
ecs_max_capacity = 5
task_cpu = "512"
task_memory = "1024"

# HTTPS Configuration
enable_https = true
certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"

# Logging
log_retention_days = 14

# Ensemble Configuration
ensemble_confidence_threshold = "0.75"
provider_timeout_ms = "5000"
nms_iou_threshold = "0.5"
