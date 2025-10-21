#!/bin/bash

# End-to-End Test Suite for Home Inventory App
# Tests both API and Flutter app integration

set -e  # Exit on error

echo "========================================="
echo "Home Inventory - E2E Test Suite"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

print_test_header() {
    echo ""
    echo -e "${YELLOW}>>> $1${NC}"
}

# Change to project root
cd "$(dirname "$0")"

# Step 1: Check prerequisites
print_test_header "Checking Prerequisites"

command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed."; exit 1; }
command -v flutter >/dev/null 2>&1 || { echo "Flutter is required but not installed."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required but not installed."; exit 1; }

print_status 0 "All prerequisites installed"

# Step 2: Start API Server
print_test_header "Starting API Server"

cd api-service

# Kill any existing processes
pkill -f "tsx watch src/app.ts" 2>/dev/null || true
sleep 1

# Start API in background
PORT=9100 npm run dev > /tmp/api-server.log 2>&1 &
API_PID=$!
echo "API Server PID: $API_PID"

# Wait for server to start
echo "Waiting for API server to start..."
for i in {1..30}; do
    if curl -s http://localhost:9100/ > /dev/null 2>&1; then
        print_status 0 "API server started successfully"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        print_status 1 "API server failed to start within 30 seconds"
        cat /tmp/api-server.log
        kill $API_PID 2>/dev/null || true
        exit 1
    fi
done

cd ..

# Step 3: Test API Endpoints
print_test_header "Testing API Endpoints"

# Test health endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9100/v1/health)
if [ "$HTTP_CODE" = "200" ]; then
    print_status 0 "Health endpoint returns 200"
else
    print_status 1 "Health endpoint failed (HTTP $HTTP_CODE)"
fi

# Test detect endpoint
echo "Testing image detection endpoint..."
# Create test image
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > /tmp/test_image.png

HTTP_CODE=$(curl -s -o /tmp/detect_response.json -w "%{http_code}" -X POST http://localhost:9100/v1/detect -F "image=@/tmp/test_image.png")
if [ "$HTTP_CODE" = "200" ]; then
    # Check response structure
    if grep -q '"success":true' /tmp/detect_response.json && grep -q '"detections"' /tmp/detect_response.json; then
        print_status 0 "Detect endpoint returns valid response"

        # Check if detections were found
        DETECTION_COUNT=$(grep -o '"label":' /tmp/detect_response.json | wc -l | tr -d ' ')
        echo "  Found $DETECTION_COUNT detection(s)"
    else
        print_status 1 "Detect endpoint response structure invalid"
    fi
else
    print_status 1 "Detect endpoint failed (HTTP $HTTP_CODE)"
    cat /tmp/detect_response.json
fi

# Step 4: Test Flutter App Build
print_test_header "Testing Flutter App Build"

cd mobile-app

# Run Flutter analyze
echo "Running Flutter analyze..."
if flutter analyze > /tmp/flutter_analyze.log 2>&1; then
    print_status 0 "Flutter analyze passed"
else
    print_status 1 "Flutter analyze found issues"
    cat /tmp/flutter_analyze.log
fi

# Run Flutter tests
echo "Running Flutter unit tests..."
if flutter test > /tmp/flutter_test.log 2>&1; then
    print_status 0 "Flutter unit tests passed"
else
    # Check if there are any tests
    if grep -q "No tests found" /tmp/flutter_test.log; then
        print_status 0 "No Flutter unit tests found (OK for now)"
    else
        print_status 1 "Flutter unit tests failed"
        cat /tmp/flutter_test.log
    fi
fi

# Try to build app
echo "Building Flutter app..."
if flutter build macos --debug > /tmp/flutter_build.log 2>&1; then
    print_status 0 "Flutter build succeeded"
else
    print_status 1 "Flutter build failed"
    tail -50 /tmp/flutter_build.log
fi

cd ..

# Step 5: Database Tests
print_test_header "Testing Database Operations"

cd mobile-app

# Check if database tables are properly defined
if grep -r "class InventoryItems extends Table" lib/data/database/tables/ > /dev/null 2>&1; then
    print_status 0 "Database tables defined"
else
    print_status 1 "Database table definitions missing"
fi

# Check database code generation
if [ -f "lib/data/database/app_database.g.dart" ]; then
    print_status 0 "Database generated code exists"
else
    print_status 1 "Database generated code missing"
fi

cd ..

# Step 6: Integration Tests
print_test_header "Testing API-App Integration"

# Test that app can connect to API
echo "Testing app configuration..."
if grep -q "apiBaseUrl.*localhost:9100" mobile-app/lib/core/config/app_config.dart || \
   grep -q "apiBaseUrl.*9100" mobile-app/lib/core/config/app_config.dart; then
    print_status 0 "App configured to use correct API endpoint"
else
    echo "  Warning: API endpoint configuration may need verification"
fi

# Cleanup
print_test_header "Cleaning Up"

kill $API_PID 2>/dev/null || true
rm -f /tmp/test_image.png /tmp/detect_response.json
print_status 0 "Cleanup completed"

# Final Report
echo ""
echo "========================================="
echo "Test Results Summary"
echo "========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "========================================="

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi
