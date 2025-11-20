variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "visual-inventory"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

# VPC Variables
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "private_subnet_cidr" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

# RDS Variables
variable "db_name" {
  description = "Database name"
  type        = string
  default     = "visual_inventory"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.1"
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ"
  type        = bool
  default     = false
}

# Redis Variables
variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "redis_node_type" {
  description = "Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis nodes"
  type        = number
  default     = 1
}

variable "redis_password" {
  description = "Redis password"
  type        = string
  sensitive   = true
}

# S3 Variables
variable "s3_bucket_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = true
}

# ECS Variables
variable "ecs_min_capacity" {
  description = "Minimum ECS task count"
  type        = number
  default     = 2
}

variable "ecs_max_capacity" {
  description = "Maximum ECS task count"
  type        = number
  default     = 10
}

variable "task_cpu" {
  description = "ECS task CPU"
  type        = string
  default     = "256"
}

variable "task_memory" {
  description = "ECS task memory"
  type        = string
  default     = "512"
}

# Container Variables
variable "api_container_image" {
  description = "API service Docker image"
  type        = string
}

# Ensemble Configuration
variable "ensemble_confidence_threshold" {
  description = "Ensemble confidence threshold"
  type        = string
  default     = "0.7"
}

variable "provider_timeout_ms" {
  description = "Provider timeout in milliseconds"
  type        = string
  default     = "4000"
}

variable "nms_iou_threshold" {
  description = "NMS IOU threshold"
  type        = string
  default     = "0.5"
}

# AWS Credentials (for external APIs)
variable "aws_access_key_id" {
  description = "AWS Access Key ID for external services"
  type        = string
  sensitive   = true
  default     = ""
}

variable "aws_secret_access_key" {
  description = "AWS Secret Access Key for external services"
  type        = string
  sensitive   = true
  default     = ""
}

# Google Credentials
variable "google_credentials" {
  description = "Google Cloud credentials JSON"
  type        = string
  sensitive   = true
  default     = ""
}

# HTTPS Configuration
variable "enable_https" {
  description = "Enable HTTPS"
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "ACM certificate ARN"
  type        = string
  default     = ""
}

# Logging
variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}
