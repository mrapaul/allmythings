#!/bin/bash

# Automated iOS release script using Fastlane
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting iOS beta release to TestFlight..."

# 0. Verification (Guarantee)
echo "🔍 Running verification suite..."
cd "$PROJECT_ROOT"
make verify

# 1. Install dependencies
echo "📦 Installing Flutter dependencies..."
cd "$PROJECT_ROOT/mobile-app"
flutter pub get

# 2. Run Fastlane beta lane
echo "🏗 Building and uploading to TestFlight..."
cd ios
bundle exec fastlane beta

echo "✅ iOS release process completed!"
