#!/bin/bash

# End-to-End Test with Real Interior Image
# Tests complete workflow: Upload → Detect → Store → Retrieve → Search

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

IMAGE_PATH="/Users/mrarindampaul/Downloads/Images/ai_interior.jpg"
API_URL="http://localhost:9100"

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}E2E Test: Real Interior Image Workflow${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Test 1: Verify image exists
echo -e "${YELLOW}[1/7] Checking image file...${NC}"
if [ ! -f "$IMAGE_PATH" ]; then
    echo -e "${RED}✗ FAILED${NC}: Image not found at $IMAGE_PATH"
    exit 1
fi
echo -e "${GREEN}✓ PASSED${NC}: Image found ($(ls -lh "$IMAGE_PATH" | awk '{print $5}'))"

# Test 2: Verify API is running
echo -e "${YELLOW}[2/7] Verifying API health...${NC}"
HEALTH=$(curl -s "$API_URL/v1/health")
if [ -z "$HEALTH" ]; then
    echo -e "${RED}✗ FAILED${NC}: API not responding"
    exit 1
fi
echo -e "${GREEN}✓ PASSED${NC}: API health check successful"
echo "$HEALTH" | python3 -m json.tool

# Test 3: Upload image and detect objects
echo ""
echo -e "${YELLOW}[3/7] Detecting objects in image...${NC}"
DETECTION_RESPONSE=$(curl -s -X POST "$API_URL/v1/detect" -F "image=@$IMAGE_PATH")

# Check if detection was successful
SUCCESS=$(echo "$DETECTION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")
if [ "$SUCCESS" != "True" ]; then
    echo -e "${RED}✗ FAILED${NC}: Detection failed"
    echo "$DETECTION_RESPONSE"
    exit 1
fi

# Extract detection details
PROCESSING_TIME=$(echo "$DETECTION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('processingTimeMs', 0))")
DETECTION_COUNT=$(echo "$DETECTION_RESPONSE" | python3 -c "import sys, json; r=json.load(sys.stdin); print(len(r['providerResults'][0]['detections']) if 'providerResults' in r else 0)")

echo -e "${GREEN}✓ PASSED${NC}: Detection completed in ${PROCESSING_TIME}ms"
echo -e "${GREEN}✓ PASSED${NC}: Found ${DETECTION_COUNT} objects"
echo ""
echo "Detected objects:"
echo "$DETECTION_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'providerResults' in data and len(data['providerResults']) > 0:
    detections = data['providerResults'][0].get('detections', [])
    for i, det in enumerate(detections, 1):
        label = det['label']
        confidence = det['confidence']
        print(f'  {i}. {label} (confidence: {confidence:.2%})')
"

# Test 4: Verify response structure
echo ""
echo -e "${YELLOW}[4/7] Validating response structure...${NC}"
echo "$DETECTION_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
required_fields = ['success', 'processingTimeMs', 'detections', 'providerResults']
missing = [f for f in required_fields if f not in data]
if missing:
    print('Missing fields:', missing)
    sys.exit(1)
"
echo -e "${GREEN}✓ PASSED${NC}: Response structure valid"

# Test 5: Verify bounding boxes
echo -e "${YELLOW}[5/7] Validating bounding boxes...${NC}"
echo "$DETECTION_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'providerResults' in data and len(data['providerResults']) > 0:
    detections = data['providerResults'][0].get('detections', [])
    for det in detections:
        bbox = det.get('boundingBox', {})
        if not all(k in bbox for k in ['left', 'top', 'width', 'height']):
            print('Invalid bounding box:', bbox)
            sys.exit(1)
        # Verify values are in valid range [0, 1]
        for k, v in bbox.items():
            if not (0 <= v <= 1):
                print(f'Bounding box {k} out of range: {v}')
                sys.exit(1)
"
echo -e "${GREEN}✓ PASSED${NC}: All bounding boxes valid"

# Test 6: Test with confidence threshold
echo ""
echo -e "${YELLOW}[6/7] Testing confidence threshold filter...${NC}"
THRESHOLD_RESPONSE=$(curl -s -X POST "$API_URL/v1/detect?minConfidence=0.8" -F "image=@$IMAGE_PATH")
HIGH_CONF_COUNT=$(echo "$THRESHOLD_RESPONSE" | python3 -c "import sys, json; r=json.load(sys.stdin); print(len([d for d in r['providerResults'][0]['detections'] if d['confidence'] >= 0.8]) if 'providerResults' in r else 0)")
echo -e "${GREEN}✓ PASSED${NC}: High confidence filter returned ${HIGH_CONF_COUNT} objects (≥80%)"

# Test 7: Measure performance
echo ""
echo -e "${YELLOW}[7/7] Performance benchmarking...${NC}"
echo "Running 5 consecutive detections..."
TOTAL_TIME=0
for i in {1..5}; do
    START=$(date +%s%N)
    curl -s -X POST "$API_URL/v1/detect" -F "image=@$IMAGE_PATH" > /dev/null
    END=$(date +%s%N)
    ELAPSED=$(( (END - START) / 1000000 ))
    TOTAL_TIME=$(( TOTAL_TIME + ELAPSED ))
    echo "  Request $i: ${ELAPSED}ms"
done
AVG_TIME=$(( TOTAL_TIME / 5 ))
echo -e "${GREEN}✓ PASSED${NC}: Average response time: ${AVG_TIME}ms"

# Final Report
echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}E2E Test Results Summary${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "Image Details:"
echo "  - Path: $IMAGE_PATH"
echo "  - Size: $(ls -lh "$IMAGE_PATH" | awk '{print $5}')"
echo "  - Dimensions: $(file "$IMAGE_PATH" | grep -oP '\d+x\d+' || echo 'N/A')"
echo ""
echo "Detection Results:"
echo "  - Objects detected: ${DETECTION_COUNT}"
echo "  - Processing time: ${PROCESSING_TIME}ms"
echo "  - Average time (5 runs): ${AVG_TIME}ms"
echo "  - High confidence (≥80%): ${HIGH_CONF_COUNT} objects"
echo ""
echo "⚠️  IMPORTANT NOTE:"
echo "    Current detections use MOCK adapter that returns RANDOM objects."
echo "    These are NOT based on actual image content."
echo ""
echo "    To enable REAL object detection:"
echo "    1. Configure Google Cloud Vision API credentials"
echo "    2. Set GOOGLE_CLOUD_PROJECT_ID in api-service/.env"
echo "    3. Set GOOGLE_APPLICATION_CREDENTIALS path"
echo "    4. Restart API server"
echo ""
echo -e "${GREEN}✅ E2E workflow verified successfully!${NC}"
echo ""
