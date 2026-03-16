#!/bin/bash

# Automated iOS testing script using Fastlane
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧪 Running iOS tests..."

# 1. Run Flutter tests
echo "📱 Running Flutter unit tests..."
cd "$PROJECT_ROOT/mobile-app"
flutter test

# 2. Run Fastlane test lane
echo "🍎 Running iOS native tests via Fastlane..."
cd ios
bundle exec fastlane test

echo "✅ iOS testing completed!"
