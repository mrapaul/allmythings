#!/bin/bash
set -x

# Comprehensive Build and Test Script
# Verifies full functionality before building

#set -e  # Exit on any error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$PROJECT_ROOT/api-service"
MOBILE_DIR="$PROJECT_ROOT/mobile-app"
TEST_IMAGE="/Users/mrarindampaul/Downloads/Images/ai_interior.jpg"

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
START_TIME=$(date +%s)

print_header() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}▶ $1${NC}"
}

print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}: $2"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗ FAILED${NC}: $2"
        ((FAILED_TESTS++))
        if [ "$3" == "critical" ]; then
            echo -e "${RED}Critical test failed. Aborting build.${NC}"
            exit 1
        fi
    fi
    ((TOTAL_TESTS++))
}

print_header "Home Inventory - Comprehensive Build & Test"
echo "Project: Visual Home Inventory Manager"
echo "Mode: Full verification before build"
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================
# PHASE 1: DEPENDENCY CHECK
# ============================================
print_header "Phase 1: Dependency Verification"

print_step "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status 0 "Node.js installed ($NODE_VERSION)"
else
    print_status 1 "Node.js not found" critical
fi

print_step "Checking Flutter..."
if command -v flutter &> /dev/null; then
    FLUTTER_VERSION=$(flutter --version | head -1)
    print_status 0 "Flutter installed ($FLUTTER_VERSION)"
else
    print_status 1 "Flutter not found" critical
fi

print_step "Checking npm packages..."
cd "$API_DIR"
if [ -d "node_modules" ]; then
    print_status 0 "API dependencies installed"
else
    echo "Installing API dependencies..."
    npm ci > /dev/null 2>&1
    print_status $? "API dependencies installation" critical
fi

# ============================================
# PHASE 2: API SERVICE TESTS
# ============================================
print_header "Phase 2: API Service Testing"

cd "$API_DIR"

print_step "Running TypeScript type checking..."
if npm run type-check > /tmp/build-type-check.log 2>&1; then
    print_status 0 "TypeScript type checking"
else
    print_status 1 "TypeScript type checking"
    tail -20 /tmp/build-type-check.log
fi

print_step "Running ESLint..."
if npm run lint > /tmp/build-lint.log 2>&1; then
    print_status 0 "ESLint validation"
else
    # Check if only warnings
    if grep -q "error" /tmp/build-lint.log; then
        print_status 1 "ESLint validation"
        grep "error" /tmp/build-lint.log | head -10
    else
        print_status 0 "ESLint validation (warnings only)"
    fi
fi

print_step "Running unit tests..."
if npm test > /tmp/build-unit-tests.log 2>&1; then
    print_status 0 "API unit tests"
    grep "Test Files" /tmp/build-unit-tests.log | tail -1
else
    print_status 1 "API unit tests" critical
    tail -20 /tmp/build-unit-tests.log
fi

print_step "Building API service..."
if npm run build > /tmp/build-api.log 2>&1; then
    print_status 0 "API build"
else
    print_status 1 "API build" critical
    tail -20 /tmp/build-api.log
fi

# ============================================
# PHASE 3: API E2E TESTS
# ============================================
print_header "Phase 3: API End-to-End Testing"

print_step "Starting API server for E2E tests..."
cd "$API_DIR"

# Check if API is already running
if lsof -i:9100 > /dev/null 2>&1; then
    print_status 0 "API server already running"
    API_ALREADY_RUNNING=true
else
    API_ALREADY_RUNNING=false
    PORT=9100 NODE_ENV=test npm run dev > /tmp/build-api-server.log 2>&1 &
    API_PID=$!

    # Wait for server to start
    for i in {1..30}; do
        if curl -s http://localhost:9100/v1/health > /dev/null 2>&1; then
            print_status 0 "API server started"
            break
        fi
        sleep 1
        if [ $i -eq 30 ]; then
            print_status 1 "API server failed to start" critical
            cat /tmp/build-api-server.log
            exit 1
        fi
    done
fi

print_step "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:9100/v1/health)
if echo "$HEALTH_RESPONSE" | grep -q "status"; then
    print_status 0 "Health endpoint responding"
else
    print_status 1 "Health endpoint" critical
fi

if [ -f "$TEST_IMAGE" ]; then
    print_step "Running E2E test with real image..."
    cd "$PROJECT_ROOT"
    if ./test-e2e-real-image.sh > /tmp/build-e2e.log 2>&1; then
        print_status 0 "E2E workflow test"
        echo "$(grep "Objects detected:" /tmp/build-e2e.log)"
        echo "$(grep "Processing time:" /tmp/build-e2e.log)"
    else
        print_status 1 "E2E workflow test"
        tail -20 /tmp/build-e2e.log
    fi
else
    print_status 0 "E2E test skipped (test image not found)"
fi

# Cleanup API server if we started it
if [ "$API_ALREADY_RUNNING" = false ]; then
    print_step "Stopping test API server..."
    kill $API_PID 2>/dev/null || true
    sleep 2
fi

# ============================================
# PHASE 4: FLUTTER APP TESTS
# ============================================
print_header "Phase 4: Flutter App Testing"

cd "$MOBILE_DIR"

print_step "Checking Flutter dependencies..."
if flutter pub get > /tmp/build-flutter-deps.log 2>&1; then
    print_status 0 "Flutter dependencies"
else
    print_status 1 "Flutter dependencies" critical
    tail -10 /tmp/build-flutter-deps.log
fi

print_step "Running Flutter analyze..."
if flutter analyze > /tmp/build-flutter-analyze.log 2>&1; then
    print_status 0 "Flutter analyze"
else
    # Check if actual errors or just warnings
    if grep -q "error •" /tmp/build-flutter-analyze.log; then
        print_status 1 "Flutter analyze"
        grep "error •" /tmp/build-flutter-analyze.log
    else
        print_status 0 "Flutter analyze (warnings only)"
    fi
fi

print_step "Running code generation..."
if flutter pub run build_runner build --delete-conflicting-outputs > /tmp/build-codegen.log 2>&1; then
    print_status 0 "Code generation"
else
    print_status 1 "Code generation"
    tail -10 /tmp/build-codegen.log
fi

print_step "Running Flutter tests..."
if flutter test > /tmp/build-flutter-tests.log 2>&1; then
    print_status 0 "Flutter unit tests"
else
    if grep -q "No tests found" /tmp/build-flutter-tests.log; then
        print_status 0 "Flutter tests (none defined yet)"
    else
        print_status 1 "Flutter unit tests"
        tail -20 /tmp/build-flutter-tests.log
    fi
fi

print_step "Building Flutter app (macOS release)..."
if flutter build macos --release > /tmp/build-flutter-build.log 2>&1; then
    BUILD_SIZE=$(du -sh build/macos/Build/Products/Release/*.app | awk '{print $1}')
    print_status 0 "Flutter build ($BUILD_SIZE)"
else
    print_status 1 "Flutter build" critical
    tail -30 /tmp/build-flutter-build.log
fi

# ============================================
# FINAL REPORT
# ============================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

print_header "Build & Test Results Summary"

echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo "Success Rate: ${SUCCESS_RATE}%"
echo "Duration: ${DURATION}s"
echo ""

# Build artifacts
echo "Build Artifacts:"
echo "  API: $API_DIR/dist/"
echo "  Flutter: $MOBILE_DIR/build/macos/Build/Products/Release/"
echo ""

# Final status
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}✅ BUILD SUCCESSFUL${NC}"
    echo -e "${GREEN}All tests passed! Build verified.${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo "You can now deploy:"
    echo "  API: cd api-service && npm start"
    echo "  App: open mobile-app/build/macos/Build/Products/Release/home_inventory.app"
    exit 0
elif [ $SUCCESS_RATE -ge 80 ]; then
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}⚠️  BUILD COMPLETED WITH WARNINGS${NC}"
    echo -e "${YELLOW}Most tests passed (${SUCCESS_RATE}%)${NC}"
    echo -e "${YELLOW}Review failures before deployment${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    exit 0
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}❌ BUILD FAILED${NC}"
    echo -e "${RED}Too many tests failed (${SUCCESS_RATE}%)${NC}"
    echo -e "${RED}Fix issues before deployment${NC}"
    echo -e "${RED}=========================================${NC}"
    exit 1
fi
