#!/bin/bash

# Unified Auto-Deploy Script for Visual Home Inventory Manager
# Starts backend services and deploys to the first connected physical device or emulator.

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

# 1. Start Backend Services
log_step "Starting backend services via Docker..."
"$PROJECT_ROOT/scripts/deploy-local-docker.sh" start

# 2. Fetch Mac IP for physical devices
log_step "Detecting Mac IP for network connectivity..."
# Try to get the primary IP address
MAC_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -n 1 | awk '{print $2}')
if [ -z "$MAC_IP" ]; then
    log_warn "Could not detect Mac IP. Falling back to localhost."
    MAC_IP="localhost"
fi
log_info "Detected Mac IP: $MAC_IP"

# 3. Detect connected devices
log_step "Detecting connected devices..."
# Get all devices from flutter
ALL_DEVICES=$(flutter devices)

# Priority: Physical iPhone > Physical Android > Simulators/Emulators
DEVICE_ID=""
DEVICE_TYPE=""

# Check for physical iPhone
IPHONE=$(echo "$ALL_DEVICES" | grep "ios" | grep -v "simulator" | head -n 1 || true)
if [ -n "$IPHONE" ]; then
    DEVICE_ID=$(echo "$IPHONE" | awk '{print $NF}')
    DEVICE_TYPE="iPhone (Physical)"
fi

# Check for physical Android
if [ -z "$DEVICE_ID" ]; then
    ANDROID=$(echo "$ALL_DEVICES" | grep "android" | grep -v "emulator" | head -n 1 || true)
    if [ -n "$ANDROID" ]; then
        DEVICE_ID=$(echo "$ANDROID" | awk '{print $1}')
        DEVICE_TYPE="Android (Physical)"
    fi
fi

# Check for Simulators/Emulators
if [ -z "$DEVICE_ID" ]; then
    SIM=$(echo "$ALL_DEVICES" | grep -E "simulator|emulator" | head -n 1 || true)
    if [ -n "$SIM" ]; then
        DEVICE_ID=$(echo "$SIM" | awk '{print $NF}')
        DEVICE_TYPE="Simulator/Emulator"
        MAC_IP="localhost" # Simulators can use localhost or specific aliases
    fi
fi

if [ -z "$DEVICE_ID" ]; then
    log_error "No devices found. Please connect a phone or start a simulator."
    exit 1
fi

log_info "Selected Target: $DEVICE_TYPE ($DEVICE_ID)"

# 4. Final API URL Construction
API_URL="http://$MAC_IP:$PORT"
# Override for Android Emulator if needed (though AppConfig handles 10.0.2.2)
if [[ "$DEVICE_TYPE" == *"Simulator/Emulator"* && "$ALL_DEVICES" == *"android"* ]]; then
    API_URL="http://10.0.2.2:$PORT"
fi

log_info "API URL for app: $API_URL"

# 5. Build and Run
log_step "Launching app on $DEVICE_TYPE..."
cd "$PROJECT_ROOT/mobile-app"

# Ensure code is generated
dart run build_runner build --delete-conflicting-outputs

# Run with the dynamic API URL
flutter run -d "$DEVICE_ID" --dart-define=API_URL="$API_URL"
