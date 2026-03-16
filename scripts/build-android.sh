#!/bin/bash
# Build Android APK for Visual Home Inventory Manager

set -e

echo "🚀 Building Android APK..."

cd mobile-app

# 1. Clean and get dependencies
echo "📦 Cleaning and getting dependencies..."
flutter clean
flutter pub get

# 2. Generate code
echo "🔧 Generating code..."
dart run build_runner build --delete-conflicting-outputs

# 3. Build APK
echo "🔨 Building APK (Release mode)..."
flutter build apk --release

echo "✅ Build complete!"
echo "📍 APK Location: mobile-app/build/app/outputs/flutter-apk/app-release.apk"
