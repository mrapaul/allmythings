aws_region = "us-east-1"
project_name = "visual-inventory"
environment = "dev"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b"]
private_subnet_cidr = ["10.0.1.0/24", "10.0.2.0/24"]
public_subnet_cidr = ["10.0.101.0/24", "10.0.102.0/24"]

# Database Configuration
db_name = "visual_inventory_dev"
db_username = "postgres"
db_instance_class = "db.t3.micro"
db_allocated_storage = 20
db_engine_version = "16.1"
db_backup_retention_period = 7
db_multi_az = false

# Redis Configuration
redis_engine_version = "7.0"
redis_node_type = "cache.t3.micro"
redis_num_cache_nodes = 1

# ECS Configuration
ecs_min_capacity = 1
ecs_max_capacity = 2
task_cpu = "256"
task_memory = "512"

# HTTPS Configuration
enable_https = false

# Logging
log_retention_days = 7

# Ensemble Configuration
ensemble_confidence_threshold = "0.7"
provider_timeout_ms = "4000"
nms_iou_threshold = "0.5"
