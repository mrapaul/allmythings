#!/bin/bash

# Visual Home Inventory Manager - Flutter App Startup Script
# Run this script to build and start the mobile app

set -e

echo "🚀 Starting Visual Home Inventory Manager..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check Flutter
echo -e "${YELLOW}Step 1/4: Checking Flutter installation...${NC}"
if ! command -v flutter &> /dev/null; then
    echo "❌ Flutter not found in PATH"
    echo "Please install Flutter from https://flutter.dev/docs/get-started/install"
    exit 1
fi
echo -e "${GREEN}✓ Flutter found${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${YELLOW}Step 2/4: Installing Flutter dependencies...${NC}"
flutter pub get
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Run build_runner
echo -e "${YELLOW}Step 3/4: Generating code with build_runner...${NC}"
echo "This will generate Drift database and Freezed model code"
dart run build_runner build --delete-conflicting-outputs
echo -e "${GREEN}✓ Code generation complete${NC}"
echo ""

# Step 4: Check for available devices
echo -e "${YELLOW}Step 4/4: Checking for available devices...${NC}"
flutter devices
echo ""

# Prompt for device selection
echo -e "${YELLOW}Available options:${NC}"
echo "1. Run on iOS Simulator (if available)"
echo "2. Run on Android Emulator (if available)"
echo "3. List devices and let me choose"
echo "4. Exit"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "Starting on iOS Simulator..."
        flutter run -d "iPhone"
        ;;
    2)
        echo "Starting on Android Emulator..."
        flutter run -d android
        ;;
    3)
        echo "Listing all devices..."
        flutter devices
        echo ""
        read -p "Enter device ID: " device_id
        flutter run -d "$device_id"
        ;;
    4)
        echo "Exiting. To run manually: flutter run -d <device-id>"
        exit 0
        ;;
    *)
        echo "Invalid choice. Run 'flutter run -d <device-id>' manually"
        exit 1
        ;;
esac
