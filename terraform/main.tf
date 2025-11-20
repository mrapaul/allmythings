terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to use S3 backend
  # backend "s3" {
  #   bucket         = "terraform-state-visual-inventory"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      CreatedAt   = timestamp()
    }
  }
}

# VPC Configuration
module "vpc" {
  source = "./modules/vpc"

  project_name = var.project_name
  environment  = var.environment

  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  private_subnet_cidr = var.private_subnet_cidr
  public_subnet_cidr  = var.public_subnet_cidr

  tags = local.common_tags
}

# RDS PostgreSQL Database
module "rds" {
  source = "./modules/rds"

  project_name = var.project_name
  environment  = var.environment

  vpc_id                  = module.vpc.vpc_id
  db_subnet_group_name    = module.vpc.db_subnet_group_name
  security_group_ids      = [aws_security_group.rds.id]

  db_name     = var.db_name
  db_username = var.db_username
  db_password = var.db_password

  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  engine_version       = var.db_engine_version

  backup_retention_period = var.db_backup_retention_period
  multi_az               = var.db_multi_az
  storage_encrypted      = true

  tags = local.common_tags
}

# ElastiCache Redis
module "redis" {
  source = "./modules/elasticache"

  project_name = var.project_name
  environment  = var.environment

  vpc_id                    = module.vpc.vpc_id
  subnet_group_name         = module.vpc.elasticache_subnet_group_name
  security_group_ids        = [aws_security_group.redis.id]

  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  parameter_group_name = "default.redis7"

  automatic_failover_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = local.common_tags
}

# S3 Bucket for Storage
module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
  bucket_name  = "${var.project_name}-${var.environment}-photos"

  versioning_enabled      = true
  server_side_encryption  = true
  public_access_blocked   = true

  lifecycle_rule = {
    enabled = true
    transitions = [
      {
        days          = 30
        storage_class = "STANDARD_IA"
      },
      {
        days          = 90
        storage_class = "GLACIER"
      }
    ]
  }

  tags = local.common_tags
}

# ECS Cluster
module "ecs_cluster" {
  source = "./modules/ecs"

  project_name = var.project_name
  environment  = var.environment

  cluster_name = "${var.project_name}-${var.environment}"

  container_insights_enabled = true

  tags = local.common_tags
}

# ALB for API Service
module "alb" {
  source = "./modules/alb"

  project_name = var.project_name
  environment  = var.environment

  vpc_id           = module.vpc.vpc_id
  security_groups  = [aws_security_group.alb.id]
  subnets          = module.vpc.public_subnet_ids

  enable_https        = var.enable_https
  certificate_arn     = var.certificate_arn

  health_check = {
    path                = "/v1/health"
    matcher             = "200-299"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.common_tags
}

# ECS Service for API
module "ecs_service" {
  source = "./modules/ecs_service"

  project_name = var.project_name
  environment  = var.environment

  cluster_id          = module.ecs_cluster.cluster_id
  service_name        = "api-service"

  container_name      = "api"
  container_image     = var.api_container_image
  container_port      = 3000

  task_definition = {
    cpu    = var.task_cpu
    memory = var.task_memory
  }

  auto_scaling = {
    min_capacity = var.ecs_min_capacity
    max_capacity = var.ecs_max_capacity
  }

  environment_variables = {
    NODE_ENV                          = var.environment
    DB_HOST                           = module.rds.endpoint
    DB_PORT                           = "5432"
    DB_NAME                           = var.db_name
    DB_USER                           = var.db_username
    REDIS_HOST                        = module.redis.primary_endpoint_address
    REDIS_PORT                        = "6379"
    S3_BASE_URL                       = "https://${module.s3.bucket_name}.s3.amazonaws.com"
    S3_BUCKET                         = module.s3.bucket_name
    S3_REGION                         = var.aws_region
    ENSEMBLE_CONFIDENCE_THRESHOLD     = var.ensemble_confidence_threshold
    PROVIDER_TIMEOUT_MS               = var.provider_timeout_ms
    NMS_IOU_THRESHOLD                 = var.nms_iou_threshold
  }

  secrets = {
    DB_PASSWORD              = aws_secretsmanager_secret.db_password.arn
    REDIS_PASSWORD           = aws_secretsmanager_secret.redis_password.arn
    AWS_ACCESS_KEY_ID        = aws_secretsmanager_secret.aws_access_key.arn
    AWS_SECRET_ACCESS_KEY    = aws_secretsmanager_secret.aws_secret_key.arn
    GOOGLE_APPLICATION_CREDENTIALS = aws_secretsmanager_secret.google_credentials.arn
  }

  target_group_arn = module.alb.target_group_arn

  tags = local.common_tags
}

# Security Groups
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb"
  description = "Security group for ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-${var.environment}-rds"
  description = "Security group for RDS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis"
  description = "Security group for Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "ecs_tasks" {
  name        = "${var.project_name}-${var.environment}-ecs-tasks"
  description = "Security group for ECS tasks"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

# Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}/${var.environment}/db-password"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}

resource "aws_secretsmanager_secret" "redis_password" {
  name                    = "${var.project_name}/${var.environment}/redis-password"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "redis_password" {
  secret_id     = aws_secretsmanager_secret.redis_password.id
  secret_string = var.redis_password
}

resource "aws_secretsmanager_secret" "aws_access_key" {
  name                    = "${var.project_name}/${var.environment}/aws-access-key"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "aws_access_key" {
  secret_id     = aws_secretsmanager_secret.aws_access_key.id
  secret_string = var.aws_access_key_id
}

resource "aws_secretsmanager_secret" "aws_secret_key" {
  name                    = "${var.project_name}/${var.environment}/aws-secret-key"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "aws_secret_key" {
  secret_id     = aws_secretsmanager_secret.aws_secret_key.id
  secret_string = var.aws_secret_access_key
}

resource "aws_secretsmanager_secret" "google_credentials" {
  name                    = "${var.project_name}/${var.environment}/google-credentials"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "google_credentials" {
  secret_id     = aws_secretsmanager_secret.google_credentials.id
  secret_string = var.google_credentials
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# Locals
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
