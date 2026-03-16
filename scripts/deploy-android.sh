#!/bin/bash
# Deploy Android APK via ADB

set -e

APK_PATH="mobile-app/build/app/outputs/flutter-apk/app-release.apk"

if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK not found at $APK_PATH"
    echo "Please run scripts/build-android.sh first."
    exit 1
fi

echo "🚀 Deploying to Android device..."

# 1. Check for devices
DEVICES=$(adb devices | grep -v "List of devices" | grep "device" | wc -l)
if [ "$DEVICES" -eq 0 ]; then
    echo "❌ No Android devices found. Connect a device or start an emulator."
    exit 1
fi

# 2. Install APK
echo "Installing $APK_PATH..."
adb install -r "$APK_PATH"

echo "✅ Deployment complete!"
