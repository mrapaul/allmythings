#!/bin/bash

# local-release.sh - Independent local release and packaging script

set -e

echo "📦 Starting Independent Release Packaging..."

# Create release directory
RELEASE_DIR="release/$(date +%Y%m%d_%H%M)"
mkdir -p "$RELEASE_DIR/backend"
mkdir -p "$RELEASE_DIR/mobile"

# 1. Build API Service
echo "🔨 Building API Service..."
cd api-service
npm install
npm run build
cp -r dist ../"$RELEASE_DIR/backend/"
cp package.json ../"$RELEASE_DIR/backend/"
cp package-lock.json ../"$RELEASE_DIR/backend/"
cp .env.example ../"$RELEASE_DIR/backend/.env"
cd ..

# 2. Build Mobile App
echo "📱 Building Mobile App (Android)..."
cd mobile-app
flutter pub get
flutter build appbundle --release
cp build/app/outputs/bundle/release/app-release.aab ../"$RELEASE_DIR/mobile/"
echo "📱 Building Mobile App (iOS Compilability)..."
flutter build ios --release --no-codesign
cd ..

# 3. Include Infrastructure Configs
echo "🛠️  Including Infrastructure Configs..."
cp infrastructure/nixos/configuration.nix "$RELEASE_DIR/"
cp docker-compose.yml "$RELEASE_DIR/"

# 4. Generate Readme
cat > "$RELEASE_DIR/README.md" <<EOF
# All My Things - Release $(date +%Y-%m-%d)

## Components
- **Backend**: Node.js Fastify API (in \`backend/\`)
- **Mobile**: Android App Bundle (in \`mobile/app-release.aab\`)
- **Infrastructure**: NixOS and Docker configs

## Independent Deployment Instructions

### Backend (Direct Node.js)
1. Copy \`backend/\` to your server.
2. Run \`npm install --production\`.
3. Configure \`.env\` with your \`GEMINI_API_KEY\`.
4. Run \`node dist/app.js\`.

### Backend (Docker)
1. Use the provided \`docker-compose.yml\`.
2. Run \`docker-compose up -d\`.

### Backend (NixOS)
1. Apply \`configuration.nix\` to your system configuration.
2. Run \`sudo nixos-rebuild switch\`.

### Mobile
1. Upload \`mobile/app-release.aab\` to Google Play Console (Internal Sharing) or install directly on device.
EOF

echo ""
echo "✅ Release packaged successfully in: $RELEASE_DIR"
echo "You can now distribute this folder independently."
