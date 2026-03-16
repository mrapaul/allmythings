#!/bin/bash
# E2E Testing Setup Script
# Initializes and configures E2E testing environment

set -e

echo "🚀 Setting up E2E Testing Environment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Install Node dependencies
echo -e "${BLUE}Step 1: Installing Node dependencies...${NC}"
npm install

# Step 2: Verify test image
echo -e "${BLUE}Step 2: Verifying test image...${NC}"
TEST_IMAGE="$HOME/Downloads/Images/ai_interior.jpg"
if [ -f "$TEST_IMAGE" ]; then
    FILE_SIZE=$(du -h "$TEST_IMAGE" | cut -f1)
    echo -e "${GREEN}✅ Test image found: $FILE_SIZE${NC}"
else
    echo -e "${YELLOW}⚠️  Test image not found at $TEST_IMAGE${NC}"
    echo "   Please ensure you have an interior image at this location"
fi

# Step 3: Check Appium installation
echo -e "${BLUE}Step 3: Checking Appium installation...${NC}"
if command -v appium &> /dev/null; then
    APPIUM_VERSION=$(appium --version)
    echo -e "${GREEN}✅ Appium installed: $APPIUM_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  Appium not found globally${NC}"
    echo "   You can still use: npm run appium"
fi

# Step 4: Check for emulators/simulators
echo -e "${BLUE}Step 4: Checking for iOS simulators...${NC}"
if command -v xcrun &> /dev/null; then
    SIMULATORS=$(xcrun simctl list devices | grep -c "iPhone 16" || true)
    if [ $SIMULATORS -gt 0 ]; then
        echo -e "${GREEN}✅ iPhone simulator found${NC}"
    else
        echo -e "${YELLOW}⚠️  iPhone 16 simulator not found${NC}"
        echo "   Run: xcrun simctl create iPhone16 com.apple.CoreSimulator.SimDeviceType.iPhone-16"
    fi
fi

echo -e "${BLUE}Step 5: Checking for Android emulators...${NC}"
if command -v emulator &> /dev/null; then
    echo -e "${GREEN}✅ Android emulator tools found${NC}"
else
    echo -e "${YELLOW}⚠️  Android emulator not configured${NC}"
    echo "   Install Android SDK and create an emulator"
fi

# Step 6: Environment configuration
echo -e "${BLUE}Step 6: Creating environment file...${NC}"
cat > .env.test << EOF
API_URL=http://localhost:14000
TEST_IMAGE_PATH=$HOME/Downloads/Images/ai_interior.jpg
APPIUM_HOST=localhost
APPIUM_PORT=4723
APPIUM_TIMEOUT=60000
LOG_LEVEL=info
EOF
echo -e "${GREEN}✅ Created .env.test${NC}"

# Step 7: Display next steps
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. Start the API server (in another terminal):"
echo "   cd ../api-service && npm run dev"
echo ""
echo "2. Start the mobile app (in another terminal):"
echo "   cd ../mobile-app && flutter run -d 'iPhone 16'"
echo ""
echo "3. Start Appium server (in another terminal):"
echo "   npm run appium"
echo ""
echo "4. Run E2E tests:"
echo "   npm test                 # Run all tests"
echo "   npm run test:api         # Run API tests only"
echo "   npm run test:mobile      # Run mobile tests only"
echo "   npm run test:watch       # Watch mode"
echo "   npm run test:coverage    # With coverage report"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "   See README.md for detailed configuration and troubleshooting"
echo ""
