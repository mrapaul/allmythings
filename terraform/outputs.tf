output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = module.alb.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer"
  value       = module.alb.zone_id
}

output "rds_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS database port"
  value       = module.rds.port
}

output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = module.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = module.redis.port
}

output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = module.s3.bucket_name
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = module.s3.bucket_arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs_cluster.cluster_name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = module.ecs_cluster.cluster_arn
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.ecs_service.service_name
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.ecs.name
}

output "cloudwatch_log_group_arn" {
  description = "CloudWatch log group ARN"
  value       = aws_cloudwatch_log_group.ecs.arn
}

output "api_url" {
  description = "API endpoint URL"
  value       = "http://${module.alb.dns_name}"
}

output "terraform_outputs" {
  description = "All important outputs for reference"
  value = {
    api_endpoint        = "http://${module.alb.dns_name}"
    database_host       = module.rds.endpoint
    redis_host          = module.redis.primary_endpoint_address
    s3_bucket           = module.s3.bucket_name
    ecs_cluster         = module.ecs_cluster.cluster_name
    log_group           = aws_cloudwatch_log_group.ecs.name
  }
}
