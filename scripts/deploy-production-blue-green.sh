#!/bin/bash

set -euo pipefail

# Blue-Green deployment script for production
# This script performs zero-downtime deployments using blue-green strategy

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
ENVIRONMENT="prod"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
DOCKER_TAG="${DOCKER_TAG:-$(git rev-parse --short HEAD)}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

check_prerequisites() {
    log_step "Checking prerequisites..."

    local required_tools=("aws" "docker" "curl" "jq")
    local missing_tools=()

    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    if [ -z "$AWS_ACCOUNT_ID" ]; then
        log_error "AWS_ACCOUNT_ID is not set"
        exit 1
    fi

    log_info "All prerequisites are installed"
}

authenticate() {
    log_step "Authenticating with AWS and registry..."

    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

    log_info "Authentication successful"
}

build_and_push_image() {
    log_step "Building Docker image..."

    local image_uri="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/visual-inventory/api-service:$DOCKER_TAG"

    docker build \
        -f "$PROJECT_ROOT/api-service/Dockerfile" \
        -t "$image_uri" \
        -t "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/visual-inventory/api-service:latest" \
        "$PROJECT_ROOT/api-service"

    log_info "Pushing image to ECR..."
    docker push "$image_uri"
    docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/visual-inventory/api-service:latest"

    log_info "Image pushed: $image_uri"
    echo "$image_uri"
}

get_current_target_group() {
    log_step "Identifying current active target group..."

    local lb_arn=$(aws elbv2 describe-load-balancers \
        --names "visual-inventory-prod-alb" \
        --region "$AWS_REGION" \
        --query "LoadBalancers[0].LoadBalancerArn" \
        --output text)

    local listeners=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$lb_arn" \
        --region "$AWS_REGION" \
        --query "Listeners[0].DefaultActions[0].TargetGroupArn" \
        --output text)

    echo "$listeners"
}

get_inactive_target_group() {
    local current_tg="$1"

    local tg_list=$(aws elbv2 describe-target-groups \
        --region "$AWS_REGION" \
        --query "TargetGroups[*].TargetGroupArn" \
        --output text)

    for tg in $tg_list; do
        if [ "$tg" != "$current_tg" ] && [[ "$tg" == *"api-service"* ]]; then
            echo "$tg"
            return 0
        fi
    done
}

update_target_group_image() {
    local target_group_arn="$1"
    local image_uri="$2"

    log_info "Updating target group with new image: $image_uri"

    # This would typically involve updating the ECS task definition
    # and registering it with the target group
    # Implementation depends on your specific setup
}

health_check_target_group() {
    local target_group_arn="$1"
    local max_attempts=60
    local attempt=0

    log_step "Performing health checks on target group..."

    local targets=$(aws elbv2 describe-target-health \
        --target-group-arn "$target_group_arn" \
        --region "$AWS_REGION" \
        --query "TargetHealthDescriptions[*].[Target.Id,TargetHealth.State]" \
        --output text)

    while [ $attempt -lt $max_attempts ]; do
        local healthy_count=0
        local total_count=0

        local health_output=$(aws elbv2 describe-target-health \
            --target-group-arn "$target_group_arn" \
            --region "$AWS_REGION" \
            --query "TargetHealthDescriptions[*].TargetHealth.State" \
            --output text)

        for state in $health_output; do
            total_count=$((total_count + 1))
            if [ "$state" = "healthy" ]; then
                healthy_count=$((healthy_count + 1))
            fi
        done

        if [ $healthy_count -gt 0 ] && [ $healthy_count -eq $total_count ]; then
            log_info "All targets are healthy ($healthy_count/$total_count)"
            return 0
        fi

        log_warn "Health check attempt $attempt/$max_attempts - Healthy: $healthy_count/$total_count"
        attempt=$((attempt + 1))
        sleep 5
    done

    log_error "Health checks failed"
    return 1
}

switch_traffic() {
    local new_target_group_arn="$1"

    log_step "Switching traffic to new target group..."

    local lb_arn=$(aws elbv2 describe-load-balancers \
        --names "visual-inventory-prod-alb" \
        --region "$AWS_REGION" \
        --query "LoadBalancers[0].LoadBalancerArn" \
        --output text)

    local listener_arn=$(aws elbv2 describe-listeners \
        --load-balancer-arn "$lb_arn" \
        --region "$AWS_REGION" \
        --query "Listeners[0].ListenerArn" \
        --output text)

    aws elbv2 modify-listener \
        --listener-arn "$listener_arn" \
        --default-actions Type=forward,TargetGroupArn="$new_target_group_arn" \
        --region "$AWS_REGION"

    log_info "Traffic switched to new target group"
}

verify_deployment() {
    log_step "Verifying deployment..."

    local endpoint="visual-inventory-prod.example.com"
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "http://$endpoint/v1/health" > /dev/null 2>&1; then
            log_info "Deployment verified - API is healthy"
            return 0
        fi

        attempt=$((attempt + 1))
        log_warn "Verification attempt $attempt/$max_attempts..."
        sleep 5
    done

    log_error "Deployment verification failed"
    return 1
}

rollback() {
    log_error "Rolling back to previous target group..."

    local current_tg=$(get_current_target_group)
    local previous_tg=$(get_inactive_target_group "$current_tg")

    if [ -n "$previous_tg" ]; then
        switch_traffic "$previous_tg"
        log_info "Rollback completed"
        return 0
    else
        log_error "Could not find previous target group for rollback"
        return 1
    fi
}

main() {
    log_info "Starting blue-green deployment to production..."

    trap 'rollback' ERR

    check_prerequisites
    authenticate

    local image_uri
    image_uri=$(build_and_push_image)

    local current_tg
    current_tg=$(get_current_target_group)
    log_info "Current active target group: $current_tg"

    local inactive_tg
    inactive_tg=$(get_inactive_target_group "$current_tg")
    log_info "Deploying to inactive target group: $inactive_tg"

    update_target_group_image "$inactive_tg" "$image_uri"

    if ! health_check_target_group "$inactive_tg"; then
        log_error "New target group failed health checks"
        exit 1
    fi

    switch_traffic "$inactive_tg"

    if ! verify_deployment; then
        log_error "Deployment verification failed, rolling back"
        rollback
        exit 1
    fi

    log_info "Blue-green deployment completed successfully!"
    log_info "New image: $image_uri"
    log_info "Active target group: $inactive_tg"

    return 0
}

main "$@"
