#!/bin/bash

# Visual Vault: Automated Quality Guarantee Suite
# This script verifies the entire stack using either Mock or Real AI.

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=14000
USE_REAL_AI=${1:-false}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Kill any existing processes on these ports
log_info "Cleaning up ports..."
lsof -ti :14000 | xargs kill -9 2>/dev/null || true
lsof -ti :14001 | xargs kill -9 2>/dev/null || true

# 1. Start Detection Service (if using real AI)
if [ "$USE_REAL_AI" = "true" ]; then
    log_info "Starting Detection Service (YOLOv11)..."
    cd "$PROJECT_ROOT/detection-service"
    ./venv/bin/python main.py > /tmp/detection_verify.log 2>&1 &
    DETECTION_PID=$!
    
    # Wait for detection health
    log_info "Waiting for Detection Service to be healthy..."
    attempt=0
    while [ $attempt -lt 30 ]; do
        if curl -sf http://localhost:14001/health > /dev/null 2>&1; then
            log_success "Detection Service is up."
            break
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
fi

# 2. Start API
log_info "Starting API (Real AI: $USE_REAL_AI) on port $PORT..."
cd "$PROJECT_ROOT/api-service"
export PORT=$PORT
if [ "$USE_REAL_AI" = "true" ]; then
    export USE_MOCK_AI=false
else
    export USE_MOCK_AI=true
fi

# Use node --env-file to ensure Gemini keys are loaded
node --env-file=.env ./node_modules/.bin/tsx src/app.ts > /tmp/api_verify.log 2>&1 &
API_PID=$!

# Function to cleanup on exit
cleanup() {
    log_info "Shutting down background services..."
    kill $API_PID 2>/dev/null || true
    if [ "${DETECTION_PID:-}" != "" ]; then
        kill $DETECTION_PID 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Wait for API health
log_info "Waiting for API to be healthy..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -sf http://localhost:$PORT/v1/health > /dev/null 2>&1; then
        log_success "API is up and healthy."
        break
    fi
    sleep 1
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        log_error "API failed to start. Logs:"
        tail -n 50 /tmp/api_verify.log
        exit 1
    fi
done

# 3. Run E2E Verification
log_info "Cleaning up old test data..."
# Delete local DB files to ensure a fresh start
find "$HOME/Library/Containers" -name "home_inventory.db" -exec rm -f {} + 2>/dev/null || true
rm -f "$HOME/Library/Application Support/allmythings/home_inventory.db"
rm -f "$HOME/Documents/home_inventory.db"

log_info "Running Flutter E2E Verification on macOS Desktop..."
cd "$PROJECT_ROOT/mobile-app"

# Ensure dependencies are ready
flutter pub get > /dev/null

# Run integration test
if ! flutter test integration_test/app_test.dart -d macos; then
    log_error "E2E tests failed! Check application logs."
    exit 1
fi

log_success "Quality Guarantee Check Completed Successfully!"
