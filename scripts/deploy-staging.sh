#!/bin/bash

set -euo pipefail

# Script for deploying to staging environment
# Prerequisites: AWS CLI, kubectl, helm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
ENVIRONMENT="staging"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
REGISTRY="${REGISTRY:-ghcr.io}"
IMAGE_NAME="${IMAGE_NAME:-visual-inventory/api-service}"
DOCKER_TAG="${DOCKER_TAG:-$(git rev-parse --short HEAD)}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing_tools=()

    for tool in aws docker curl; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    log_info "All prerequisites are installed"
}

authenticate_registry() {
    log_info "Authenticating with Docker registry..."

    if [ -z "$AWS_ACCOUNT_ID" ]; then
        log_error "AWS_ACCOUNT_ID is not set"
        exit 1
    fi

    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

    log_info "Registry authentication successful"
}

build_and_push_image() {
    log_info "Building and pushing Docker image..."

    local image_uri="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_NAME:$DOCKER_TAG"

    docker build \
        -f "$PROJECT_ROOT/api-service/Dockerfile" \
        -t "$image_uri" \
        -t "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_NAME:latest" \
        "$PROJECT_ROOT/api-service"

    log_info "Pushing image to ECR..."
    docker push "$image_uri"
    docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$IMAGE_NAME:latest"

    log_info "Image pushed successfully: $image_uri"
    echo "$image_uri"
}

deploy_with_terraform() {
    log_info "Deploying infrastructure with Terraform..."

    cd "$PROJECT_ROOT/terraform"

    local tfvars_file="environments/staging.tfvars"

    if [ ! -f "$tfvars_file" ]; then
        log_error "Terraform variables file not found: $tfvars_file"
        exit 1
    fi

    log_info "Initializing Terraform..."
    terraform init

    log_info "Planning Terraform deployment..."
    terraform plan -var-file="$tfvars_file" -out=tfplan

    log_info "Applying Terraform configuration..."
    terraform apply tfplan

    log_info "Terraform deployment completed"
}

update_ecs_service() {
    log_info "Updating ECS service..."

    local cluster_name="visual-inventory-staging"
    local service_name="api-service"

    aws ecs update-service \
        --cluster "$cluster_name" \
        --service "$service_name" \
        --force-new-deployment \
        --region "$AWS_REGION"

    log_info "ECS service update initiated"

    log_info "Waiting for service to stabilize..."
    aws ecs wait services-stable \
        --cluster "$cluster_name" \
        --services "$service_name" \
        --region "$AWS_REGION"

    log_info "ECS service is stable"
}

run_health_checks() {
    log_info "Running health checks..."

    local endpoint=$(aws cloudformation describe-stacks \
        --stack-name "visual-inventory-staging" \
        --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
        --output text \
        --region "$AWS_REGION")

    if [ -z "$endpoint" ]; then
        log_warn "Could not retrieve endpoint from CloudFormation"
        return 0
    fi

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "http://$endpoint/v1/health" > /dev/null 2>&1; then
            log_info "Health check passed"
            return 0
        fi

        attempt=$((attempt + 1))
        log_warn "Health check attempt $attempt/$max_attempts..."
        sleep 5
    done

    log_error "Health checks failed"
    return 1
}

run_smoke_tests() {
    log_info "Running smoke tests..."

    local endpoint=$(aws cloudformation describe-stacks \
        --stack-name "visual-inventory-staging" \
        --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
        --output text \
        --region "$AWS_REGION")

    # Test basic endpoints
    local endpoints=(
        "GET:http://$endpoint/v1/health"
        "GET:http://$endpoint/"
    )

    for test in "${endpoints[@]}"; do
        IFS=':' read -r method url <<< "$test"
        log_info "Testing: $method $url"

        if ! curl -sf -X "$method" "$url" > /dev/null 2>&1; then
            log_error "Smoke test failed: $method $url"
            return 1
        fi
    done

    log_info "All smoke tests passed"
    return 0
}

main() {
    log_info "Starting deployment to $ENVIRONMENT environment..."

    check_prerequisites
    authenticate_registry

    local image_uri
    image_uri=$(build_and_push_image)

    log_info "Deploying with image: $image_uri"

    if deploy_with_terraform; then
        if update_ecs_service; then
            if run_health_checks; then
                if run_smoke_tests; then
                    log_info "Deployment completed successfully!"
                    return 0
                else
                    log_error "Smoke tests failed"
                    return 1
                fi
            else
                log_error "Health checks failed"
                return 1
            fi
        else
            log_error "ECS service update failed"
            return 1
        fi
    else
        log_error "Terraform deployment failed"
        return 1
    fi
}

main "$@"
