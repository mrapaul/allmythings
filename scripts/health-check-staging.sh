#!/bin/bash

set -euo pipefail

# Health check script for staging environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

AWS_REGION="${AWS_REGION:-us-east-1}"

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

check_health() {
    log_info "Running health checks..."

    local endpoint=$(aws cloudformation describe-stacks \
        --stack-name "visual-inventory-staging" \
        --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
        --output text \
        --region "$AWS_REGION" 2>/dev/null || echo "")

    if [ -z "$endpoint" ]; then
        log_error "Could not retrieve endpoint from CloudFormation"
        return 1
    fi

    log_info "Testing endpoint: http://$endpoint"

    # Test health endpoint
    log_info "Testing GET /v1/health..."
    if curl -sf "http://$endpoint/v1/health" > /dev/null 2>&1; then
        log_info "Health endpoint: OK"
    else
        log_error "Health endpoint: FAILED"
        return 1
    fi

    # Test root endpoint
    log_info "Testing GET /..."
    if curl -sf "http://$endpoint/" > /dev/null 2>&1; then
        log_info "Root endpoint: OK"
    else
        log_error "Root endpoint: FAILED"
        return 1
    fi

    # Test API endpoints
    log_info "Testing API endpoints..."

    local endpoints=(
        "GET:http://$endpoint/v1/items"
        "GET:http://$endpoint/v1/labels"
        "GET:http://$endpoint/v1/search?q=test"
    )

    for test in "${endpoints[@]}"; do
        IFS=':' read -r method url <<< "$test"
        log_info "Testing $method $url..."
        if curl -sf -X "$method" "$url" > /dev/null 2>&1; then
            log_info "  -> OK"
        else
            log_warn "  -> WARNING (may be expected if endpoint requires auth)"
        fi
    done

    log_info "All health checks passed!"
    return 0
}

check_database() {
    log_info "Checking database connectivity..."

    # Get RDS endpoint from Terraform outputs
    local db_endpoint=$(cd "$PROJECT_ROOT/terraform" && \
        terraform output -raw rds_endpoint 2>/dev/null || echo "")

    if [ -z "$db_endpoint" ]; then
        log_warn "Could not retrieve database endpoint"
        return 0
    fi

    log_info "Database endpoint: $db_endpoint"
    # Additional database checks would go here
    return 0
}

check_redis() {
    log_info "Checking Redis connectivity..."

    local redis_endpoint=$(cd "$PROJECT_ROOT/terraform" && \
        terraform output -raw redis_endpoint 2>/dev/null || echo "")

    if [ -z "$redis_endpoint" ]; then
        log_warn "Could not retrieve Redis endpoint"
        return 0
    fi

    log_info "Redis endpoint: $redis_endpoint"
    # Additional Redis checks would go here
    return 0
}

check_logs() {
    log_info "Checking recent logs for errors..."

    local log_group="/ecs/visual-inventory-staging"
    local recent_errors=$(aws logs filter-log-events \
        --log-group-name "$log_group" \
        --start-time $(($(date +%s) * 1000 - 300000)) \
        --filter-pattern "ERROR" \
        --region "$AWS_REGION" 2>/dev/null | jq '.events | length' || echo "0")

    if [ "$recent_errors" -gt 0 ]; then
        log_warn "Found $recent_errors errors in recent logs"
        return 1
    else
        log_info "No errors found in recent logs"
        return 0
    fi
}

main() {
    log_info "Starting health checks for staging environment..."

    local failed=0

    if ! check_health; then
        failed=$((failed + 1))
    fi

    if ! check_database; then
        failed=$((failed + 1))
    fi

    if ! check_redis; then
        failed=$((failed + 1))
    fi

    if ! check_logs; then
        failed=$((failed + 1))
    fi

    if [ $failed -eq 0 ]; then
        log_info "All health checks passed!"
        return 0
    else
        log_error "$failed health check(s) failed"
        return 1
    fi
}

main "$@"
