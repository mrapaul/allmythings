#!/bin/bash

# Android Emulator Test Script
# Builds and tests the app on Android Emulator

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

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

cd "$(dirname "$0")/mobile-app"

print_header "Android Emulator Build & Test"

# Check if Android SDK is installed
if [ ! -d "$HOME/Library/Android/sdk" ] && [ ! -d "$ANDROID_HOME" ]; then
    print_header "Android SDK Not Found"
    echo "Android SDK is required to test on Android."
    echo ""
    echo "Installation Steps:"
    echo ""
    echo "1. Install Android Studio:"
    echo "   Download from: https://developer.android.com/studio"
    echo ""
    echo "2. Open Android Studio and install:"
    echo "   - Android SDK"
    echo "   - Android SDK Platform-Tools"
    echo "   - Android SDK Build-Tools"
    echo "   - Android Emulator"
    echo ""
    echo "3. Create an Android Virtual Device (AVD):"
    echo "   - Tools → Device Manager → Create Device"
    echo "   - Select: Pixel 7 (or similar)"
    echo "   - System Image: Android 14 (API 34)"
    echo ""
    echo "4. Set environment variables in ~/.zshrc or ~/.bashrc:"
    echo "   export ANDROID_HOME=\$HOME/Library/Android/sdk"
    echo "   export PATH=\$PATH:\$ANDROID_HOME/emulator"
    echo "   export PATH=\$PATH:\$ANDROID_HOME/platform-tools"
    echo "   export PATH=\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin"
    echo ""
    echo "5. Reload shell: source ~/.zshrc"
    echo ""
    echo "6. Verify installation: flutter doctor"
    echo ""
    exit 1
fi

# Set ANDROID_HOME if not set
if [ -z "$ANDROID_HOME" ]; then
    if [ -d "$HOME/Library/Android/sdk" ]; then
        export ANDROID_HOME="$HOME/Library/Android/sdk"
        export PATH="$PATH:$ANDROID_HOME/emulator"
        export PATH="$PATH:$ANDROID_HOME/platform-tools"
    fi
fi

print_step "Checking Android SDK installation..."
print_success "Android SDK found at: $ANDROID_HOME"

# Check for available AVDs
print_step "Checking for Android Virtual Devices..."
AVD_LIST=$("$ANDROID_HOME/emulator/emulator" -list-avds 2>/dev/null || echo "")

if [ -z "$AVD_LIST" ]; then
    print_warning "No Android Virtual Devices found"
    echo ""
    echo "Please create an AVD first:"
    echo "  1. Open Android Studio"
    echo "  2. Tools → Device Manager"
    echo "  3. Click 'Create Device'"
    echo "  4. Select: Pixel 7"
    echo "  5. System Image: Android 14 (API 34)"
    echo "  6. Click 'Finish'"
    echo ""
    exit 1
fi

# Use first AVD or specified one
if [ -n "$1" ]; then
    AVD_NAME="$1"
else
    AVD_NAME=$(echo "$AVD_LIST" | head -1)
fi

print_success "Using AVD: $AVD_NAME"

# Check if emulator is already running
RUNNING_EMULATOR=$(adb devices | grep "emulator" | awk '{print $1}')

if [ -z "$RUNNING_EMULATOR" ]; then
    print_step "Starting Android emulator..."
    "$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" -no-snapshot-load &
    EMULATOR_PID=$!

    # Wait for emulator to boot
    print_step "Waiting for emulator to boot..."
    for i in {1..60}; do
        BOOT_COMPLETE=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
        if [ "$BOOT_COMPLETE" == "1" ]; then
            print_success "Emulator booted"
            break
        fi
        sleep 2
        if [ $i -eq 60 ]; then
            print_error "Emulator failed to boot"
            exit 1
        fi
    done
else
    print_success "Emulator already running: $RUNNING_EMULATOR"
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

# Build for Android
print_step "Building for Android (debug)..."
flutter build apk --debug
print_success "Android build completed"

# Install and run on emulator
print_step "Installing on emulator..."
flutter install

print_success "App installed on Android emulator"

print_header "Testing Instructions"

echo "The app is now running on the Android Emulator."
echo ""
echo "Manual Tests to Perform:"
echo ""
echo "1. Camera Button Test:"
echo "   - Tap the center + button"
echo "   - Verify full-screen camera interface appears"
echo ""
echo "2. Permission Test:"
echo "   - Tap 'Take Photo' or 'Choose from Gallery'"
echo "   - Android will show permission dialog"
echo "   - Grant camera and storage permissions"
echo ""
echo "3. Photo Selection Test:"
echo "   - Choose a photo from gallery"
echo "   - Watch for 'Identifying objects...' message"
echo "   - Verify success message"
echo ""
echo "4. Home Feed Test:"
echo "   - Verify items appear in home feed"
echo "   - Tap items to view details"
echo ""
echo "To add photos to emulator:"
echo "  1. Drag and drop images onto emulator window"
echo "  2. Or use: adb push /path/to/image.jpg /sdcard/Pictures/"
echo ""
echo "Example: Add test image to emulator:"
echo "  adb push ~/Downloads/Images/ai_interior.jpg /sdcard/Pictures/"
echo ""

# Keep script running to monitor logs
print_step "Monitoring app logs (Ctrl+C to stop)..."
echo ""
flutter logs
