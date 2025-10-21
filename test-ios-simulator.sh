#!/bin/bash

# iOS Simulator Test Script
# Builds and tests the app on iOS Simulator

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
}

print_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

cd "$(dirname "$0")/mobile-app"

print_header "iOS Simulator Build & Test"

# Check if a specific simulator ID was provided
if [ -n "$1" ]; then
    SIMULATOR_ID="$1"
    print_step "Using specified simulator: $SIMULATOR_ID"
else
    # Default to iPhone 16 Pro
    SIMULATOR_ID="78A288C9-A527-412E-950D-7AA45BB92006"
    print_step "Using default simulator: iPhone 16 Pro"
fi

# Get simulator info
SIMULATOR_NAME=$(xcrun simctl list devices | grep "$SIMULATOR_ID" | sed 's/(.*//' | xargs)
print_step "Simulator: $SIMULATOR_NAME"

# Check if simulator is booted
SIMULATOR_STATE=$(xcrun simctl list devices | grep "$SIMULATOR_ID" | grep -o "(.*)" | tr -d "()")

if [ "$SIMULATOR_STATE" != "Booted" ]; then
    print_step "Booting simulator..."
    xcrun simctl boot "$SIMULATOR_ID"

    # Wait for simulator to boot
    for i in {1..30}; do
        STATE=$(xcrun simctl list devices | grep "$SIMULATOR_ID" | grep -o "(.*)" | tr -d "()")
        if [ "$STATE" == "Booted" ]; then
            print_success "Simulator booted"
            break
        fi
        sleep 1
        if [ $i -eq 30 ]; then
            print_error "Simulator failed to boot"
            exit 1
        fi
    done

    # Open Simulator app
    open -a Simulator
    sleep 2
else
    print_success "Simulator already running"
fi

# Clean previous builds
print_step "Cleaning previous builds..."
flutter clean > /dev/null 2>&1
print_success "Clean completed"

# Get dependencies
print_step "Getting Flutter dependencies..."
flutter pub get > /dev/null 2>&1
print_success "Dependencies installed"

# Run code generation
print_step "Running code generation..."
flutter pub run build_runner build --delete-conflicting-outputs > /dev/null 2>&1
print_success "Code generation completed"

# Build for iOS
print_step "Building for iOS..."
flutter build ios --simulator --debug
print_success "iOS build completed"

# Install and run on simulator
print_step "Installing on simulator..."
flutter install -d "$SIMULATOR_ID"
print_success "App installed on simulator"

print_header "Testing Instructions"

echo "The app is now running on the iOS Simulator."
echo ""
echo "Manual Tests to Perform:"
echo ""
echo "1. Camera Button Test:"
echo "   - Tap the center + button"
echo "   - Verify full-screen camera interface appears"
echo "   - Check for large white circle button"
echo ""
echo "2. Permission Test:"
echo "   - Tap 'Take Photo' or 'Choose from Gallery'"
echo "   - iOS will show permission dialog"
echo "   - Grant photo library permission"
echo ""
echo "3. Photo Selection Test:"
echo "   - Choose a photo from the simulator's library"
echo "   - Watch for 'Identifying objects...' message"
echo "   - Verify success message with item count"
echo ""
echo "4. Home Feed Test:"
echo "   - Verify items appear in home feed"
echo "   - Tap an item to view details"
echo ""
echo "5. Search Test:"
echo "   - Tap search icon in bottom nav"
echo "   - Try searching for an object"
echo ""
echo "To add photos to simulator:"
echo "  - Drag and drop images into Simulator window"
echo "  - Or use: xcrun simctl addmedia $SIMULATOR_ID /path/to/image.jpg"
echo ""

# Keep script running to monitor logs
print_step "Monitoring app logs (Ctrl+C to stop)..."
echo ""
flutter logs -d "$SIMULATOR_ID"
