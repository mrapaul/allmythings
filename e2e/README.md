# End-to-End Testing Suite

Comprehensive E2E testing framework for the All My Things app, supporting:
- **API Testing** with real images (Detections, Ensemble Fusion)
- **Mobile App Testing** on iOS and Android (Appium)
- **Cross-platform Validation** (UI, Navigation, Performance)

## Test Frameworks Used

### 1. **Jest** (Recommended for All Tests)
- Industry standard for JavaScript/TypeScript testing
- Great for API and unit tests
- Fast, parallel execution
- Built-in mocking and coverage
- [jest.io](https://jestjs.io)

### 2. **Appium** (For Mobile E2E)
- Cross-platform mobile automation
- Works with iOS and Android
- Uses WebDriver protocol (W3C standard)
- Real devices or emulators/simulators
- [appium.io](https://appium.io)

### 3. **WebDriverIO** (Optional Enhancement)
- Bindings for Appium
- Better TypeScript support
- Fluent API for mobile interactions
- [webdriver.io](https://webdriver.io)

## Quick Start

### 1. Install Dependencies

```bash
cd e2e
npm install
```

### 2. Start API Server

```bash
cd ../api-service
npm run dev
# API runs on http://localhost:8000
```

### 3. Start Mobile App (iOS)

```bash
cd ../mobile-app
flutter run -d "iPhone 16"
# Or for Android:
# flutter run -d "Medium_Phone_API_36"
```

### 4. Start Appium Server (in another terminal)

```bash
cd e2e
npm run appium
# Or: appium --address localhost --port 4723
```

### 5. Run Tests

```bash
# Run all E2E tests
npm test

# Run only API tests
npm run test:api

# Run only mobile app tests
npm run test:mobile

# Watch mode (auto-rerun on changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

## Test Suites

### API Tests (`api-vision-test.ts`)

Tests the vision detection API with real interior images.

**Features:**
- ✅ Health check endpoint
- ✅ Real image detection (ai_interior.jpg)
- ✅ Detection accuracy validation
- ✅ Ensemble fusion validation
- ✅ Bounding box validation
- ✅ Performance benchmarks
- ✅ Concurrent request handling

**Run:**
```bash
npm run test:api
```

**Test Image:**
- Path: `~/Downloads/Images/ai_interior.jpg`
- Size: 825 KB
- Type: Interior scene with furniture

### Mobile App Tests (`app-e2e.ts`)

Tests the Flutter app UI and navigation on both iOS and Android.

**Features:**
- ✅ App launch verification
- ✅ Home screen validation
- ✅ Camera navigation
- ✅ Bottom tab switching
- ✅ Rapid navigation stress testing
- ✅ Background/resume handling
- ✅ Memory leak detection
- ✅ Response time validation
- ✅ Cross-platform consistency

**Runs on:**
- iOS: iPhone 16 simulator
- Android: Nexus 5X emulator (API 36)

**Run:**
```bash
npm run test:mobile
```

## Test Results

### API Vision Tests
Expected output:
```
✅ Health check - API is running
✅ Detect objects in interior image using FormData
   Detection Results:
   - Detections found: 12+
   - Image dimensions: 1920x1080
   - Processing time: 2000-5000ms
   - Top detections: furniture, chair, table, lamp...

✅ Detections include furniture and room items
✅ Ensemble fusion provides confidence metrics
   - Google: 8 detections, confidence: 0.85
   - AWS: 6 detections, confidence: 0.79
   - Mock: 12 detections, confidence: 0.90

✅ Bounding boxes are properly formatted
✅ Performance: Detection completes within acceptable time (< 30s)
✅ Multiple consecutive requests work correctly
```

### Mobile App Tests
Expected output:
```
iOS Platform Tests:
  ✅ App launches without crashing
  ✅ Home screen displays inventory feed
  ✅ Navigation to camera screen works
  ✅ Back navigation from camera works
  ✅ Bottom navigation tabs switch screens
  ✅ App handles rapid navigation without crashing
  ✅ Screen remains responsive during operations
  ✅ Memory usage remains stable
  ✅ App can be put in background and resumed

Android Platform Tests:
  ✅ (Same tests for Android platform)

Cross-Platform Tests:
  ✅ Both platforms have consistent UI
  ✅ Performance characteristics are similar
```

## Continuous Integration (CI/CD)

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install E2E dependencies
        run: cd e2e && npm install

      - name: Start API server
        run: cd api-service && npm run dev &

      - name: Run API tests
        run: cd e2e && npm run test:api

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Troubleshooting

### Appium Won't Start
```bash
# Make sure no other process is using port 4723
lsof -i :4723

# Kill any existing Appium
pkill -f appium

# Start fresh
npm run appium
```

### App Won't Launch
```bash
# Clear and rebuild
flutter clean
flutter pub get
flutter build ios --simulator  # Or Android equivalent
flutter run -d "iPhone 16"
```

### Test Timeouts
- API tests: Increase timeout in `jest.config.js` (testTimeout)
- Mobile tests: Check if emulator/simulator is running
- Network tests: Check API server is accessible

### Missing Test Image
```bash
# Verify test image exists
ls -lh ~/Downloads/Images/ai_interior.jpg

# Or download a sample interior image and place it there
mkdir -p ~/Downloads/Images/
# Download or copy your image to this location
```

## Best Practices

### 1. **Test Isolation**
- Each test is independent
- No shared state between tests
- Clean setup/teardown

### 2. **Performance**
- API tests: Validate response time < 30s
- Mobile tests: Validate screen transition < 5s
- Memory: Monitor for leaks

### 3. **Error Handling**
- Graceful fallbacks
- Clear error messages
- Retry mechanisms where appropriate

### 4. **Maintainability**
- Use helper functions
- Document test purposes
- Keep tests focused and small

### 5. **Coverage**
- Aim for >80% code coverage
- Focus on critical paths
- Test error conditions

## Advanced Configurations

### Custom Appium Capabilities

```javascript
const iosOptions = {
  capabilities: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone 16',
    'appium:app': './build/ios/iphonesimulator/Runner.app',
    'appium:bundleId': 'com.homeinventory.homeInventory',
    'appium:noReset': false,      // Fresh app state for each test
    'appium:fullReset': false,    // Preserve login state
    'appium:autoAcceptAlerts': true,  // Auto-accept permission dialogs
    'appium:preventMockLocation': false,
  }
};
```

### Environment Variables

```bash
# .env.e2e
API_URL=http://localhost:8000
TEST_IMAGE_PATH=~/Downloads/Images/ai_interior.jpg
APPIUM_HOST=localhost
APPIUM_PORT=4723
APPIUM_TIMEOUT=60000
```

## Reporting

Run with coverage:
```bash
npm run test:coverage
```

View coverage report:
```bash
# HTML report
open coverage/lcov-report/index.html

# Terminal report
cat coverage/lcov.info
```

## Next Steps

1. **CI/CD Integration**: Add tests to GitHub Actions
2. **Performance Baselines**: Establish performance benchmarks
3. **Visual Regression**: Add screenshot comparison tests
4. **Load Testing**: Test API with concurrent requests
5. **Accessibility**: Add accessibility compliance tests

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Appium Documentation](https://appium.io/docs/en/latest/)
- [WebDriverIO Guide](https://webdriver.io/docs/gettingstarted/)
- [Flutter Testing Guide](https://flutter.dev/docs/testing)

## Support

For issues or questions:
1. Check test output logs
2. Review test configuration
3. Verify dependencies are installed
4. Ensure emulator/simulator is running
5. Check API server is accessible

---

Last Updated: 2025-11-19
Framework Version: Appium 2.0+, Jest 29.5+, WebDriverIO 8.24+
