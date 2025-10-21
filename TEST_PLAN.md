# Home Inventory App - Comprehensive Test Plan

## Automated Test Coverage

### ✅ API Service Tests (23/24 passing)
- Health endpoint validation
- Detection endpoint structure
- Error handling (missing image, invalid formats)
- Edge cases (1x1 pixel, 5MB files, corrupted data)
- Concurrent requests (10 parallel)
- Sequential stress testing (50 requests)
- Memory leak detection

### ✅ Flutter Integration Tests (7/9 passing)
- App startup and navigation
- Bottom navigation bar
- Camera button UI flow
- Search screen
- Profile screen
- Database initialization

### ✅ CI/CD Pipeline
- Automated testing on push/PR
- Security scanning (Trivy + npm audit)
- Build validation
- Multi-platform testing (Ubuntu, macOS)

## ❌ Test Gaps - Manual Testing Required

### 1. Real Photo Capture
**What's Missing:**
- No automated test can actually take photos from camera
- No test with real household object images
- No camera permission flow testing

**Manual Test Steps:**
1. Open app on device
2. Tap camera button
3. Grant camera permission (first time)
4. Take photo of desk with laptop, phone, notebook
5. ✓ Verify photo preview appears
6. ✓ Verify loading indicator shows

### 2. Real Object Detection
**Critical Limitation:**
```typescript
// Current: Mock adapter returns RANDOM objects
const mockObjects = ['chair', 'table', 'laptop', 'phone', ...];
// Returns: Random selection, NOT based on image content
```

**What's Missing:**
- Mock adapter doesn't analyze actual image content
- No test verifying detected objects match photo
- No accuracy testing

**To Enable Real Detection:**
```bash
# Set in api-service/.env
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

**Manual Test Steps:**
1. Configure Google Cloud Vision API credentials
2. Restart API server
3. Take photo of known objects (laptop, phone, coffee cup)
4. ✓ Verify API returns those specific objects
5. ✓ Verify confidence scores > 0.7
6. ✓ Verify bounding boxes are reasonable

### 3. Database Storage Verification
**What's Missing:**
- No test verifying detected objects are saved
- No test for multiple detections from one photo
- No test for photo/thumbnail file persistence

**Manual Test Steps:**
1. Take photo with 3 visible objects
2. Wait for detection to complete
3. ✓ Verify all 3 objects appear in home feed
4. Tap each item
5. ✓ Verify photo displays correctly
6. ✓ Verify thumbnail loads fast
7. Close and restart app
8. ✓ Verify items persist after restart

### 4. Search Functionality
**What's Missing:**
- No test with real search queries
- No test for search by custom labels
- No test for partial matches

**Manual Test Steps:**
1. Add items with labels: "laptop", "work", "electronics"
2. Search for "lap"
3. ✓ Verify laptop appears (partial match)
4. Search for "work"
5. ✓ Verify all work-labeled items appear
6. Search for "LAPTOP" (uppercase)
7. ✓ Verify case-insensitive search works

### 5. Label Management
**What's Missing:**
- No test for adding custom labels
- No test for editing labels
- No test for deleting labels
- No test for label autocomplete

**Manual Test Steps:**
1. Open item detail screen
2. Add label "electronics"
3. ✓ Verify label saves and displays
4. Add label "work"
5. ✓ Verify both labels display
6. Edit label "work" → "office"
7. ✓ Verify label updated
8. Delete label "electronics"
9. ✓ Verify label removed
10. Search by label "office"
11. ✓ Verify item appears in results

### 6. Full End-to-End Workflow
**What's Missing:**
- No complete photo → detect → store → retrieve test
- No test with multiple photos in sequence
- No test for network failures during detection

**Manual Test Steps:**

#### Happy Path
1. Clean install app
2. Grant camera permission
3. Take photo of desk (laptop, phone, notebook visible)
4. ✓ Verify loading shows
5. ✓ Verify success message appears
6. ✓ Verify 3 items appear in feed
7. Tap laptop item
8. ✓ Verify photo displays full size
9. Add labels: "work", "electronics", "expensive"
10. ✓ Verify labels save
11. Navigate to search
12. Search "electronics"
13. ✓ Verify laptop appears
14. Take second photo (coffee cup, mouse)
15. ✓ Verify 2 more items added (total 5)
16. Close app completely
17. Reopen app
18. ✓ Verify all 5 items still present
19. ✓ Verify photos still load
20. ✓ Verify labels still present

#### Error Paths
1. Turn off WiFi
2. Take photo
3. ✓ Verify appropriate error message
4. Turn on WiFi
5. Retry
6. ✓ Verify detection works
7. Fill storage to near capacity
8. Take photo
9. ✓ Verify handles low storage gracefully
10. Deny camera permission
11. Tap camera button
12. ✓ Verify permission request appears

## Test Results Summary

| Test Category | Automated | Manual Required |
|--------------|-----------|-----------------|
| API Endpoints | ✅ 23/24 | ❌ Real images |
| Flutter UI | ✅ 7/9 | ❌ Real interactions |
| Database CRUD | ✅ Full | ❌ Real data |
| Photo Capture | ❌ None | ⚠️  Required |
| Object Detection | ⚠️  Mock only | ⚠️  Required |
| Storage Workflow | ⚠️  Partial | ⚠️  Required |
| Search | ⚠️  UI only | ⚠️  Required |
| Labels | ❌ None | ⚠️  Required |
| E2E Workflow | ⚠️  Partial | ⚠️  Required |

## Running Tests

### Automated Tests
```bash
# Run all tests locally
./test-all.sh

# Run API tests only
cd api-service && npm test

# Run Flutter tests only
cd mobile-app && flutter test

# Run E2E tests
./test-e2e.sh

# Run CI/CD pipeline locally
act -j api-tests  # Requires 'act' CLI
```

### Manual Tests
1. Deploy app to physical device or simulator
2. Follow test steps in sections above
3. Document results in `TEST_RESULTS.md`
4. Take screenshots of critical paths
5. Report any bugs in GitHub Issues

## For Production Readiness

Before deploying to production, complete:

- [ ] All manual test scenarios pass
- [ ] Configure real Google Cloud Vision API
- [ ] Test with 100+ real photos
- [ ] Verify detection accuracy > 80%
- [ ] Load test with 10+ concurrent users
- [ ] Security audit completed
- [ ] Privacy policy implemented
- [ ] Camera permissions properly handled
- [ ] Error messages are user-friendly
- [ ] Loading states are clear
- [ ] App works offline (graceful degradation)
