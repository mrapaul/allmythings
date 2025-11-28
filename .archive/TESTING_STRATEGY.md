# Comprehensive Testing Strategy - 80% Coverage Goal

## Project Overview
- **Visual Home Inventory Manager**: Multi-platform app (Mobile + Web/API)
- **Coverage Target**: 80% across all services
- **Testing Frameworks**: Vitest (API), Flutter test (Mobile), Playwright (E2E)

## Testing Pyramid Architecture

```
        E2E Tests (10-20%)
     [Playwright, Appium]
    /                      \
   /                        \
Integration Tests (20-30%)
[Contract, Provider, Service]
  /                          \
/                            \
Unit Tests (50-60%)
[Pure Logic, Models, Utils]
```

## Coverage Goals by Module

### API Service (`/api-service`)
- **Target**: 80% line coverage
- **Current Status**: Under development
- **Key Areas**:
  - Vision adapters (Google, AWS, Mock)
  - Ensemble fusion logic
  - Multi-pass detection pipeline
  - Image quality analysis
  - Health check endpoints

### Mobile App (`/mobile-app`)
- **Target**: 80% line coverage
- **Current Status**: Building foundation
- **Key Areas**:
  - Domain models (Freezed, serialization)
  - Riverpod providers (state management)
  - Repository layer (database, API)
  - Service layer (detection, image processing)
  - Widget components (UI)

## 1. Unit Tests (Core Coverage)

### API Service Unit Tests
```
api-service/tests/unit/
├── algorithms.unit.test.ts         (NMS, deduplication)
├── semantic-expansion.test.ts      (Object mappings, confidence)
├── multi-pass-detection.test.ts    (Detection pipeline)
├── image-quality.service.test.ts   (Blur, brightness, contrast)
└── vision-adapter.unit.tests.ts    (Adapter interface compliance)
```

**Coverage target**: 85% of service logic

### Flutter Unit Tests
```
mobile-app/test/unit/
├── domain/models/
│   ├── detection_models_test.dart
│   ├── item_test.dart
│   └── ensemble_details_test.dart
├── services/
│   ├── image_processing_service_test.dart
│   └── database_service_test.dart
└── utils/
    ├── validators_test.dart
    └── formatters_test.dart
```

**Coverage target**: 85% of pure logic

## 2. Integration Tests (Behavior Verification)

### API Integration Tests
```
api-service/src/__tests__/integration/
├── detect.integration.test.ts           (Full detection flow)
├── ensemble-fusion.integration.test.ts  (Provider coordination)
├── image-quality.integration.test.ts    (Quality checks + detection)
├── multi-provider.integration.test.ts   (Google + AWS + Mock)
├── error-handling.integration.test.ts   (Error scenarios)
└── rate-limiting.integration.test.ts    (Performance boundaries)
```

**Test Structure**:
```typescript
describe('Detection Endpoint', () => {
  let server: FastifyInstance;
  let client: TestClient;

  beforeAll(async () => {
    server = await createTestServer();
    client = await TestClient.create(server);
  });

  test('detects objects in real image', async () => {
    const response = await client.detect(testImagePath);
    expect(response.status).toBe(200);
    expect(response.body.detections).toHaveLength(> 0);
  });
});
```

### Flutter Integration Tests
```
mobile-app/test/integration_test/
├── app_test.dart                      (Full app startup)
├── detection_flow_test.dart           (Camera → Detection → Save)
├── inventory_search_test.dart         (Search functionality)
├── database_sync_test.dart            (Local/Remote sync)
└── offline_functionality_test.dart    (Offline first)
```

## 3. Provider/Contract Tests (Interface Verification)

### API Provider Adapter Tests
```
api-service/src/__tests__/contract/
├── vision-adapter.contract.test.ts   (All adapters implement interface)
├── google-vision.test.ts             (Google-specific logic)
├── aws-rekognition.test.ts           (AWS-specific logic)
└── mock-vision.test.ts               (Mock data generation)
```

### Flutter Provider Tests
```
mobile-app/test/providers/
├── detection_providers_test.dart     (Detection state management)
├── inventory_providers_test.dart     (Inventory CRUD)
├── camera_providers_test.dart        (Camera initialization)
└── database_provider_test.dart       (Database instance)
```

## 4. Widget Tests (UI Component Verification)

Modern approach using **Golden Files & Skia Gold**:

```
mobile-app/test/widgets/
├── item_card_test.dart
├── detection_card_test.dart
├── label_input_test.dart
├── image_picker_button_test.dart
├── search_bar_test.dart
└── goldens/
    ├── item_card.light.png
    ├── item_card.dark.png
    ├── detection_card.light.png
    └── ... (visual regression baselines)
```

**Golden Test Pattern**:
```dart
testWidgets('ItemCard renders correctly', (WidgetTester tester) async {
  await tester.pumpWidget(
    MaterialApp(
      home: ItemCard(item: testItem),
    ),
  );

  expect(
    find.byType(ItemCard),
    matchesGoldenFile('goldens/item_card.light.png'),
  );
});
```

## 5. E2E Tests (User Journey Verification)

### Playwright Tests (Web/Desktop)
```
e2e/tests/
├── authentication.spec.ts
├── detection_workflow.spec.ts
├── inventory_management.spec.ts
├── search_and_filter.spec.ts
└── offline_sync.spec.ts
```

### Appium Tests (iOS/Android)
```
mobile-app/test_driver/
├── appium_e2e_test.dart
├── test_scenarios/
│   ├── camera_detection_test.dart
│   ├── inventory_crud_test.dart
│   └── search_test.dart
└── capabilities/
    ├── ios_capabilities.yaml
    └── android_capabilities.yaml
```

## Test Execution Strategy

### Local Development
```bash
# Run all tests with coverage
make test

# Run specific test suites
make test-api        # API unit + integration
make test-mobile     # Flutter unit + integration
make test-e2e        # Playwright + Appium

# Watch mode for development
make test-watch
```

### CI/CD Pipeline
See `.github/workflows/` for:
- **Unit & Integration Tests**: Run on every push
- **E2E Tests**: Run on PRs & main branch
- **Coverage Reports**: Generated & commented on PRs
- **Performance Tests**: Run nightly

## Coverage Measurement

### API Service (Vitest)
```bash
cd api-service
npm run test:coverage
# Outputs: coverage/index.html
```

**Target coverage**:
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### Flutter App
```bash
cd mobile-app
flutter test --coverage
# Outputs: coverage/lcov.info
```

**Target coverage**:
- Statements: 80%
- Lines: 80%

### Consolidated Report
```bash
./scripts/generate-coverage-report.sh
# Outputs: coverage-report.html (merged metrics)
```

## Key Testing Patterns

### 1. **Dependency Injection for Testability**

```dart
// Flutter Example
class InventoryRepository {
  final DetectionService _detectionService;
  final DatabaseService _databaseService;

  InventoryRepository({
    DetectionService? detectionService,
    DatabaseService? databaseService,
  })  : _detectionService = detectionService ?? MockDetectionService(),
        _databaseService = databaseService ?? MockDatabaseService();
}

// In tests: inject mocks
test('saves detection', () async {
  final mockDetection = MockDetectionService();
  final repo = InventoryRepository(detectionService: mockDetection);
  // Test with mock
});
```

### 2. **Fixture Management**

```dart
// mobile-app/test/fixtures/
// - sample_images/
//   - interior.jpg (real test image)
//   - corrupted.dat
// - detection_fixtures.dart (sample responses)
// - inventory_fixtures.dart (sample items)

// Usage:
final testImage = File('test/fixtures/sample_images/interior.jpg');
final sampleDetection = detectionFixtures.couch();
```

### 3. **Mocking Strategies**

```typescript
// API Service: Mockito for Jest/Vitest
const mockGoogleVision = {
  detect: jest.fn().mockResolvedValue([...]),
};

// Flutter: Mockito for Dart
final mockDetectionService = MockDetectionService();
when(mockDetectionService.detect(any))
    .thenAnswer((_) async => testDetections);
```

### 4. **Golden File Management**

```dart
// Run once to create goldens:
flutter test --update-goldens

// Then commit:
git add test/widgets/goldens/*.png
```

## Troubleshooting Common Issues

### Mobile App Test Failures

**Problem**: `Item not found` model errors
**Solution**: Run code generation before tests
```bash
flutter pub run build_runner build --delete-conflicting-outputs
flutter test
```

**Problem**: Golden file mismatches
**Solution**: Update goldens on CI
```bash
flutter test --update-goldens
git add goldens/
```

### API Test Failures

**Problem**: Port already in use
**Solution**: Kill process and retry
```bash
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill
npm run test
```

**Problem**: Database connection timeout
**Solution**: Ensure test database is configured
```bash
# Check .env.test
DATABASE_URL=sqlite::memory:
```

## Success Metrics

- **Unit Test Pass Rate**: >95%
- **Integration Test Pass Rate**: >90%
- **E2E Test Pass Rate**: >85%
- **Code Coverage**: >80% across all modules
- **Test Execution Time**: <5 min (unit), <15 min (all tests)
- **CI/CD Pass Rate**: >98%

## Next Steps

1. ✅ Fix test compilation errors and missing models
2. ⏳ Set up unified coverage measurement
3. ⏳ Implement missing unit tests
4. ⏳ Add comprehensive integration tests
5. ⏳ Configure E2E test suite
6. ⏳ Integrate into CI/CD pipeline
7. ⏳ Validate 80% coverage achievement

---

**Last Updated**: 2025-11-25
**Maintainers**: Development Team
**Test Coverage Dashboard**: [Link to CI dashboard]
