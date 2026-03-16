#!/bin/bash

# Automated deployment script for physical iPhone testing
# Uses Localtunnel (open source) to bridge the Mac API to the public internet

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=14000

# 1. Check for Localtunnel
if ! command -v lt &> /dev/null; then
    log_warn "Localtunnel (lt) not found. Installing..."
    npm install -g localtunnel
fi

# 2. Check for connected iOS devices
log_step "Checking for connected iOS devices..."
DEVICES=$(flutter devices | grep ios | grep -v "simulator" || true)
if [ -z "$DEVICES" ]; then
    log_error "No physical iPhone found. Please connect your iPhone via USB and tap 'Trust'."
    exit 1
fi
log_info "Found device: $DEVICES"

# 3. Start Backend Services
log_step "Starting backend services via Docker..."
"$PROJECT_ROOT/scripts/deploy-local-docker.sh" start

# 4. Start Tunnel
log_step "Starting Localtunnel on port $PORT..."
# Start lt in background and save URL
lt --port $PORT --subdomain allmythings-api > /tmp/lt_url.txt 2>&1 &
LT_PID=$!

# Wait for URL to be generated
sleep 5
TUNNEL_URL=$(grep -o 'https://[^ ]*' /tmp/lt_url.txt | head -n 1 || true)

if [ -z "$TUNNEL_URL" ]; then
    # Fallback to local IP if tunnel fails
    log_warn "Tunnel failed to start. Falling back to local IP."
    LOCAL_IP=$(ifconfig en0 | grep inet | grep -v inet6 | awk '{print $2}')
    TUNNEL_URL="http://$LOCAL_IP:$PORT"
fi

log_info "Public API URL: $TUNNEL_URL"

# 5. Update Flutter App Config
log_step "Updating AppConfig with new URL..."
CONFIG_FILE="$PROJECT_ROOT/mobile-app/lib/core/config/app_config.dart"
sed -i '' "s|static const String apiBaseUrl = '.*'|static const String apiBaseUrl = '$TUNNEL_URL'|g" "$CONFIG_FILE"

# 6. Build and Run on Device
log_step "Launching app on physical device..."
cd "$PROJECT_ROOT/mobile-app"
flutter run -d $(echo "$DEVICES" | awk '{print $NF}')

# Cleanup tunnel on exit
trap "kill $LT_PID" EXIT
