#!/bin/bash
# Check iOS development environment for Visual Home Inventory Manager

set -e

echo "🔍 Checking iOS development environment..."

# 1. Check for Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode (xcodebuild) not found. Please install Xcode from the Mac App Store."
    exit 1
fi
echo "✅ Xcode found: $(xcodebuild -version | head -n 1)"

# 2. Check for CocoaPods
if ! command -v pod &> /dev/null; then
    echo "❌ CocoaPods (pod) not found. Please install it via 'brew install cocoapods'."
    exit 1
fi
echo "✅ CocoaPods found: $(pod --version)"

# 3. Check Flutter iOS setup
echo "🔍 Running flutter doctor for iOS..."
flutter doctor --only-hosts ios

# 4. Check for connected iOS devices
echo "🔍 Checking for connected iOS devices..."
DEVICES=$(flutter devices | grep "ios" || true)
if [ -z "$DEVICES" ]; then
    echo "⚠️  No iOS devices found. Please connect an iPhone or start a Simulator."
else
    echo "✅ iOS devices/simulators found:"
    echo "$DEVICES"
fi

echo ""
echo "💡 To build for a physical device:"
echo "1. cd mobile-app/ios"
echo "2. open Runner.xcworkspace"
echo "3. Configure 'Signing & Capabilities' with your Apple ID"
echo "4. Select your device and click Play/Build"
