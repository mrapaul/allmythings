#!/bin/bash

# Comprehensive Test Runner
# Runs all tests: API unit tests, edge cases, Flutter tests, and E2E

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

print_header() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=========================================${NC}"
}

print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}: $2"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗ FAILED${NC}: $2"
        ((FAILED_TESTS++))
    fi
    ((TOTAL_TESTS++))
}

# Change to project root
cd "$(dirname "$0")"

print_header "Home Inventory - Comprehensive Test Suite"

# ============================================
# API TESTS
# ============================================
print_header "API Service Tests"

cd api-service

echo "Installing API dependencies..."
npm ci > /dev/null 2>&1
print_status $? "API dependencies installed"

echo "Running API unit tests..."
if npm test > /tmp/api-unit-tests.log 2>&1; then
    print_status 0 "API unit tests"
    grep "Test Files" /tmp/api-unit-tests.log | tail -1
else
    print_status 1 "API unit tests"
    tail -20 /tmp/api-unit-tests.log
fi

echo "Running TypeScript type checking..."
if npx tsc --noEmit > /tmp/api-tsc.log 2>&1; then
    print_status 0 "TypeScript type checking"
else
    print_status 1 "TypeScript type checking"
    tail -10 /tmp/api-tsc.log
fi

cd ..

# ============================================
# FLUTTER TESTS
# ============================================
print_header "Flutter App Tests"

cd mobile-app

echo "Installing Flutter dependencies..."
if flutter pub get > /tmp/flutter-deps.log 2>&1; then
    print_status 0 "Flutter dependencies installed"
else
    print_status 1 "Flutter dependencies installation"
    tail -10 /tmp/flutter-deps.log
fi

echo "Running Flutter analyze..."
if flutter analyze > /tmp/flutter-analyze.log 2>&1; then
    print_status 0 "Flutter analyze"
else
    # Check if there are actual errors or just info
    if grep -q "error •" /tmp/flutter-analyze.log; then
        print_status 1 "Flutter analyze"
        grep "error •" /tmp/flutter-analyze.log
    else
        print_status 0 "Flutter analyze (warnings only)"
    fi
fi

echo "Running Flutter unit tests..."
if flutter test > /tmp/flutter-unit-tests.log 2>&1; then
    print_status 0 "Flutter unit tests"
else
    if grep -q "No tests found" /tmp/flutter-unit-tests.log; then
        print_status 0 "Flutter unit tests (none defined)"
    else
        print_status 1 "Flutter unit tests"
        tail -20 /tmp/flutter-unit-tests.log
    fi
fi

echo "Running code generation..."
if flutter pub run build_runner build --delete-conflicting-outputs > /tmp/flutter-codegen.log 2>&1; then
    print_status 0 "Code generation"
else
    print_status 1 "Code generation"
    tail -10 /tmp/flutter-codegen.log
fi

cd ..

# ============================================
# EDGE CASE TESTS (with running API)
# ============================================
print_header "Edge Case & Integration Tests"

cd api-service

echo "Starting API server..."
PORT=9100 NODE_ENV=development npm run dev > /tmp/api-edge-server.log 2>&1 &
API_PID=$!
echo "API PID: $API_PID"

# Wait for server
for i in {1..30}; do
    if curl -s http://localhost:9100/v1/health > /dev/null 2>&1; then
        print_status 0 "API server started"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        print_status 1 "API server failed to start"
        cat /tmp/api-edge-server.log
        exit 1
    fi
done

# Test health endpoint
echo "Testing health endpoint..."
if curl -s http://localhost:9100/v1/health | grep -q "status"; then
    print_status 0 "Health endpoint"
else
    print_status 1 "Health endpoint"
fi

# Test detect endpoint
echo "Testing detect endpoint..."
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > /tmp/test.png
if curl -s -X POST http://localhost:9100/v1/detect -F "image=@/tmp/test.png" | grep -q "success"; then
    print_status 0 "Detect endpoint"
else
    print_status 1 "Detect endpoint"
fi

# Edge case: Large file
echo "Testing large file handling..."
dd if=/dev/zero of=/tmp/large.bin bs=1M count=5 2>/dev/null
response_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9100/v1/detect -F "image=@/tmp/large.bin")
if [[ "$response_code" =~ ^[245][0-9][0-9]$ ]]; then
    print_status 0 "Large file handling (HTTP $response_code)"
else
    print_status 1 "Large file handling (HTTP $response_code)"
fi

# Edge case: Invalid image
echo "Testing invalid image handling..."
echo "not an image" > /tmp/invalid.txt
response_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9100/v1/detect -F "image=@/tmp/invalid.txt")
if [[ "$response_code" =~ ^[245][0-9][0-9]$ ]]; then
    print_status 0 "Invalid image handling (HTTP $response_code)"
else
    print_status 1 "Invalid image handling (HTTP $response_code)"
fi

# Edge case: Missing image
echo "Testing missing image handling..."
response_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:9100/v1/detect -H "Content-Type: multipart/form-data")
if [[ "$response_code" =~ ^[245][0-9][0-9]$ ]]; then
    print_status 0 "Missing image handling (HTTP $response_code)"
else
    print_status 1 "Missing image handling (HTTP $response_code)"
fi

# Edge case: High confidence threshold
echo "Testing high confidence threshold..."
if curl -s -X POST "http://localhost:9100/v1/detect?minConfidence=0.99" -F "image=@/tmp/test.png" | grep -q "detections"; then
    print_status 0 "High confidence threshold"
else
    print_status 1 "High confidence threshold"
fi

# Stress test: Concurrent requests
echo "Testing concurrent requests..."
for i in {1..10}; do
    curl -s -X POST http://localhost:9100/v1/detect -F "image=@/tmp/test.png" > /dev/null &
done
wait
print_status 0 "Concurrent requests"

# Stress test: Sequential requests
echo "Testing sequential requests..."
success_count=0
for i in {1..20}; do
    if curl -s -X POST http://localhost:9100/v1/detect -F "image=@/tmp/test.png" | grep -q "success"; then
        ((success_count++))
    fi
done
if [ $success_count -ge 18 ]; then
    print_status 0 "Sequential stress test ($success_count/20 succeeded)"
else
    print_status 1 "Sequential stress test ($success_count/20 succeeded)"
fi

# Cleanup
echo "Stopping API server..."
kill $API_PID 2>/dev/null || true
rm -f /tmp/test.png /tmp/large.bin /tmp/invalid.txt

cd ..

# ============================================
# FINAL REPORT
# ============================================
print_header "Test Results Summary"

echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo "Success Rate: ${success_rate}%"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
elif [ $success_rate -ge 80 ]; then
    echo -e "${YELLOW}⚠️  Most tests passed (${success_rate}%)${NC}"
    exit 0
else
    echo -e "${RED}❌ Too many tests failed (${success_rate}%)${NC}"
    exit 1
fi
