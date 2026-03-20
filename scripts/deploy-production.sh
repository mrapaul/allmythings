#!/bin/bash

# deploy-production.sh - Unified production deployment script

set -e

echo "🚀 Starting Production Deployment Sequence..."

# 1. Environment Check
if [ -z "$GEMINI_API_KEY" ]; then
  echo "❌ Error: GEMINI_API_KEY is not set. This is required for production Vision AI."
  exit 1
fi

# 2. API Service Build
echo "📦 Building API Service..."
cd api-service
npm install
npm run build
cd ..

# 3. Mobile App (Compilability Check)
echo "📱 Checking Mobile App Compilability..."
cd mobile-app
flutter pub get
flutter build appbundle --release
cd ..

# 4. Versioning & Trigger CI
echo "🏷️ Tagging version for Production Build & Distribution..."
CURRENT_VERSION=$(grep "version: " mobile-app/pubspec.yaml | sed 's/version: //')
TAG_NAME="v$CURRENT_VERSION-prod-$(date +%Y%m%d%H%M)"

echo "Creating tag: $TAG_NAME"
git tag -a "$TAG_NAME" -m "Production release $TAG_NAME"
# git push origin "$TAG_NAME" # Uncomment to push and trigger GitHub Actions

# 5. NixOS Backend Sync (Informational)
echo ""
echo "🖥️  NixOS Backend Deployment Info:"
echo "To deploy the API service to your NixOS server:"
echo "1. Sync the api-service/ directory to /var/lib/allmythings/api-service"
echo "2. Apply infrastructure/nixos/configuration.nix to your server"
echo "3. Run 'sudo nixos-rebuild switch' on the target server"

echo ""
echo "✅ Deployment sequence prepared. Push the tag to trigger automated distribution."
echo "   git push origin $TAG_NAME"
