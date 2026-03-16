#!/bin/bash

set -euo pipefail

# Script for deploying locally with Docker Compose
# Usage: ./scripts/deploy-local-docker.sh [build|start|stop|restart|logs|clean]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    log_info "Docker is installed: $(docker --version)"
}

check_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    log_info "Docker Compose is installed: $(docker-compose --version)"
}

load_env_file() {
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            log_warn "No .env file found. Creating from .env.example"
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        else
            log_error "No .env file found and .env.example not available"
            exit 1
        fi
    fi
    log_info "Loaded environment configuration from .env"
}

deploy_build() {
    log_info "Building Docker images..."
    cd "$PROJECT_ROOT"
    docker-compose build --no-cache
    log_info "Build completed successfully"
}

deploy_start() {
    log_info "Starting services..."
    cd "$PROJECT_ROOT"
    docker-compose up -d
    log_info "Services started"

    log_info "Waiting for services to be ready..."
    sleep 10

    log_info "Checking service health..."
    check_health
}

deploy_stop() {
    log_info "Stopping services..."
    cd "$PROJECT_ROOT"
    docker-compose down
    log_info "Services stopped"
}

deploy_restart() {
    log_info "Restarting services..."
    deploy_stop
    sleep 3
    deploy_start
}

deploy_logs() {
    log_info "Displaying logs (Ctrl+C to exit)..."
    cd "$PROJECT_ROOT"
    docker-compose logs -f
}

deploy_clean() {
    log_warn "This will remove all containers, volumes, and networks"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up Docker resources..."
        cd "$PROJECT_ROOT"
        docker-compose down -v
        log_info "Cleanup completed"
    else
        log_info "Cleanup cancelled"
    fi
}

check_health() {
    log_info "Checking API health..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost:14000/v1/health > /dev/null 2>&1; then
            log_info "API is healthy"
            return 0
        fi

        attempt=$((attempt + 1))
        log_warn "Health check attempt $attempt/$max_attempts..."
        sleep 2
    done

    log_error "API failed to become healthy"
    return 1
}

status() {
    log_info "Service status:"
    cd "$PROJECT_ROOT"
    docker-compose ps

    log_info "Network status:"
    docker network ls | grep visual-inventory || log_warn "Network not found"

    log_info "Volume status:"
    docker volume ls | grep visual-inventory || log_warn "No volumes found"
}

main() {
    local command="${1:-help}"

    check_docker
    check_docker_compose
    load_env_file

    case "$command" in
        build)
            deploy_build
            ;;
        start)
            deploy_start
            ;;
        stop)
            deploy_stop
            ;;
        restart)
            deploy_restart
            ;;
        logs)
            deploy_logs
            ;;
        clean)
            deploy_clean
            ;;
        status)
            status
            ;;
        help|*)
            cat <<EOF
Usage: $0 [COMMAND]

Commands:
    build       Build Docker images
    start       Start all services
    stop        Stop all services
    restart     Restart all services
    logs        Display service logs
    status      Show service status
    clean       Remove all containers, volumes, and networks
    help        Display this help message

Examples:
    $0 build        # Build images
    $0 start        # Start services
    $0 logs         # View logs
    $0 clean        # Clean up everything

Environment:
    Create a .env file based on .env.example before running.

Services:
    - PostgreSQL Database (postgres:5432)
    - Redis Cache (redis:6379)
    - API Service (api:3000)
    - MinIO S3 Storage (minio:9000, console:9001)
EOF
            ;;
    esac
}

main "$@"
