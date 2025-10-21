#!/bin/bash

# Multi-Platform Test Runner
# Tests the app on macOS, iOS Simulator, and Android Emulator

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
}

print_menu() {
    echo -e "${CYAN}Select platforms to test:${NC}"
    echo ""
    echo "  1) macOS Desktop"
    echo "  2) iOS Simulator"
    echo "  3) Android Emulator"
    echo "  4) All Platforms"
    echo "  5) Exit"
    echo ""
}

run_macos() {
    print_header "Testing on macOS"
    cd "$(dirname "$0")/mobile-app"

    echo "Building for macOS..."
    flutter build macos --release

    echo "Launching app..."
    open build/macos/Build/Products/Release/home_inventory.app

    echo ""
    echo -e "${GREEN}✓ macOS app launched${NC}"
    echo "Test the camera functionality and verify objects are detected."
    echo ""
}

run_ios() {
    print_header "Testing on iOS Simulator"

    # Show available simulators
    echo "Available iOS Simulators:"
    xcrun simctl list devices available | grep -E "iPhone|iPad" | nl
    echo ""

    read -p "Enter simulator number (or press Enter for iPhone 16 Pro): " SIM_NUM

    if [ -z "$SIM_NUM" ]; then
        # Default to iPhone 16 Pro
        SIM_ID="78A288C9-A527-412E-950D-7AA45BB92006"
    else
        # Get the selected simulator ID
        SIM_LINE=$(xcrun simctl list devices available | grep -E "iPhone|iPad" | sed -n "${SIM_NUM}p")
        SIM_ID=$(echo "$SIM_LINE" | grep -o "([A-F0-9-]*)" | tr -d "()")
    fi

    ./test-ios-simulator.sh "$SIM_ID"
}

run_android() {
    print_header "Testing on Android Emulator"

    # Check if Android SDK exists
    if [ ! -d "$HOME/Library/Android/sdk" ] && [ -z "$ANDROID_HOME" ]; then
        echo -e "${YELLOW}Android SDK not found${NC}"
        echo ""
        echo "Would you like to see Android setup instructions? (y/n)"
        read -r ANSWER

        if [ "$ANSWER" == "y" ]; then
            ./test-android.sh
        fi
        return
    fi

    ./test-android.sh
}

print_header "Multi-Platform Test Runner"

echo "This script will help you test the app on different platforms."
echo "Make sure the API server is running on port 9100."
echo ""

# Check if API is running
if curl -s http://localhost:9100/v1/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API server is running${NC}"
else
    echo -e "${YELLOW}⚠ API server not detected${NC}"
    echo "Start it with: cd api-service && PORT=9100 npm run dev"
    echo ""
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 1
    fi
fi

echo ""

while true; do
    print_menu
    read -p "Enter your choice: " CHOICE

    case $CHOICE in
        1)
            run_macos
            echo ""
            read -p "Press Enter to continue..."
            ;;
        2)
            run_ios
            break
            ;;
        3)
            run_android
            break
            ;;
        4)
            print_header "Running All Platform Tests"
            echo "Testing on macOS..."
            run_macos
            echo ""
            echo "Press Enter when ready to test iOS..."
            read
            run_ios
            ;;
        5)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac
done
