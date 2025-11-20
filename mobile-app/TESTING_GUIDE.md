# Testing Guide - Home Inventory App

Comprehensive guide for understanding and working with the test suite.

## Quick Start

```bash
# Run all tests
flutter test

# Run with coverage
flutter test --coverage

# Watch mode
flutter test --watch

# Run specific test
flutter test test/presentation/camera/camera_screen_test.dart
```

## Test Types

### 1. Widget Tests (Unit-level UI Testing)

Test individual screens and components in isolation.

**Location**: `test/presentation/`

**Key Features**:
- Fast execution (milliseconds)
- No device/emulator required
- Test UI behavior and interactions
- Mock dependencies

**Example**:
```dart
testWidgets('should display camera preview', (tester) async {
  await tester.pumpWidget(createTestWidget());
  expect(find.byType(CameraPreview), findsOneWidget);
});
```

**Best Practices**:
- Test user interactions, not implementation
- Use semantic finders (byType, byIcon, byText)
- Always call `pumpAndSettle()` after interactions
- Test edge cases and error states
- Verify accessibility attributes

### 2. Provider Tests

Test Riverpod state management.

**Location**: `test/application/providers/`

**Key Features**:
- Test with ProviderContainer
- Mock external dependencies
- Verify caching and invalidation
- Test loading/success/error states

**Example**:
```dart
test('should fetch inventory items', () async {
  final container = ProviderContainer(
    overrides: [
      inventoryRepositoryProvider.overrideWithValue(mockRepository),
    ],
  );

  final result = await container.read(inventoryItemsProvider.future);
  expect(result, isNotEmpty);
});
```

**Best Practices**:
- Use ProviderContainer for isolation
- Override dependencies consistently
- Test all async states
- Verify side effects

### 3. Repository Tests

Test data persistence and retrieval.

**Location**: `test/data/repositories/`

**Key Features**:
- Test CRUD operations
- Verify data consistency
- Test error handling
- Mock underlying data sources

**Example**:
```dart
test('should save and retrieve item', () async {
  await repository.create(item);
  final retrieved = await repository.getById(item.id!);
  expect(retrieved, equals(item));
});
```

### 4. Service Tests

Test business logic and utilities.

**Location**: `test/services/`

**Key Features**:
- Test core functionality
- Test with edge cases
- Verify resource cleanup
- Test async operations

**Example**:
```dart
test('should compress image', () {
  final bytes = createTestImage();
  final compressed = service.compressImage(bytes);
  expect(compressed.length, lessThan(bytes.length));
});
```

### 5. Integration Tests

Test complete user flows end-to-end.

**Location**: `integration_test/`

**Key Features**:
- Test full user journeys
- Run on real device/emulator
- Slower but comprehensive
- Test real API and database

**Example**:
```dart
testWidgets('complete detection flow', (tester) async {
  await tester.pumpWidget(createApp());

  // Navigate to camera
  await tester.tap(find.byIcon(Icons.camera));
  await tester.pumpAndSettle();

  // Capture image
  await tester.tap(find.byIcon(Icons.circle));
  await tester.pumpAndSettle();

  // Verify detection results
  expect(find.byType(DetectionResultsScreen), findsOneWidget);
});
```

### 6. Accessibility Tests

Test WCAG compliance and accessibility.

**Location**: `test/accessibility/`

**Key Features**:
- Semantic labels
- Touch target sizes
- Color contrast
- Screen reader support
- Keyboard navigation

## Test Data

### Mock Data Factory

Create consistent test data:

```dart
// Single detection
final detection = MockDataFactory.createDetection(
  label: 'lamp',
  confidence: 0.95,
);

// Multiple detections
final detections = MockDataFactory.createDetections(5);

// With custom properties
final item = MockDataFactory.createInventoryItem(
  id: 1,
  label: 'lamp',
  location: 'bedroom',
);

// Detection response
final response = MockDataFactory.createDetectionResponse(
  detections: detections,
  ensembleMetrics: metrics,
);
```

### Fake Database

In-memory database for testing:

```dart
final fakeDb = FakeAppDatabase();

// Insert item
await fakeDb.insertItem(item);

// Query items
final items = await fakeDb.getAllItems();

// Search
final results = await fakeDb.searchItemsByLabel('lamp');

// Clear
await fakeDb.clearAllData();
```

## Test Utilities

### Widget Helpers

```dart
// Create test widget with Riverpod
createRiverpodTestWidget(MyWidget(), overrides: [...])

// Tap and settle
await tapAndSettle(tester, find.text('Button'));

// Enter text
await enterText(tester, find.byType(TextField), 'search');

// Clear text
await clearText(tester, find.byType(TextField));

// Scroll to widget
await scrollToWidget(tester, find.byType(Item));

// Verify widget exists
expectWidgetExists(find.byType(MyWidget));
expectTextExists('Label');
expectIconExists(Icons.search);

// Verify touch target (48x48dp minimum)
expectMinimumTouchTarget(find.byIcon(Icons.camera));

// Verify semantic label
expectSemanticLabel('Camera Permission');
```

## Mocking Strategy

### Mocking API Client

```dart
class FakeApiClient extends ApiClient {
  void setupResponse(String imagePath, DetectionResponse response) {
    _responses[imagePath] = response;
  }

  void setupFailure(String error) {
    throwOnNextRequest = true;
    nextError = error;
  }
}

// Usage
final apiClient = FakeApiClient();
apiClient.setupResponse('/path/to/image.jpg', mockResponse);
apiClient.setupFailure('Network error');
```

### Mocking Repositories

```dart
class MockInventoryRepository extends Mock
    implements InventoryRepository {}

final mock = MockInventoryRepository();
when(() => mock.getAll())
    .thenAnswer((_) async => testItems);
```

### Overriding Providers

```dart
ProviderContainer(
  overrides: [
    inventoryRepositoryProvider.overrideWithValue(mockRepo),
    detectionRepositoryProvider.overrideWithValue(mockDetection),
    apiClientProvider.overrideWithValue(fakeClient),
  ],
)
```

## Test Coverage

### Coverage Goals

- **Overall**: 80%+ code coverage
- **Critical paths**: 95%+ coverage
- **UI layer**: 90%+ widget coverage
- **Business logic**: 85%+ service coverage

### Generating Reports

```bash
# Generate coverage
flutter test --coverage

# View coverage summary
cat coverage/lcov.info

# HTML report (requires lcov)
lcov --list coverage/lcov.info
open coverage/index.html
```

## Running Tests

### By Category

```bash
# Widget tests only
flutter test test/presentation/

# Provider tests
flutter test test/application/providers/

# Repository tests
flutter test test/data/repositories/

# Service tests
flutter test test/services/

# Accessibility tests
flutter test test/accessibility/

# Integration tests
flutter test integration_test/
```

### By Pattern

```bash
# Tests matching pattern
flutter test --grep="Camera"

# Exclude integration tests
flutter test --exclude-tags=integration

# Specific file
flutter test test/presentation/camera/camera_screen_test.dart
```

### Watch Mode

```bash
# Re-run tests on file changes
flutter test --watch

# With specific pattern
flutter test --watch --grep="Camera"
```

## Debugging Tests

### Enable Verbose Output

```bash
flutter test --verbose
```

### Print Widget Tree

```dart
debugPrint(find.byType(MyWidget).toString());
```

### Screenshot Capture

```dart
await tester.takeScreenshot('screenshot.png');
```

### Slow Down Animations

```bash
flutter test --slow-start-animation
```

### Keep Emulator Alive

```bash
flutter test --keep-app-running
```

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Push to develop/main/feature branches
- Pull requests to main/develop

**Test Coverage**:
- Ubuntu + macOS
- Flutter stable + beta
- Unit tests
- Widget tests
- Integration tests
- Accessibility tests
- Coverage reports

**See**: `.github/workflows/flutter_test.yml`

### Local Pre-commit

```bash
#!/bin/bash
cd mobile-app
flutter test --coverage
flutter analyze
```

## Troubleshooting

### Test Timeout

```bash
flutter test --verbose --test-randomize-ordering-seed=12345
```

### Widget Not Found

- Ensure `pumpAndSettle()` called
- Check widget hierarchy
- Verify finder is correct
- Add explicit waits if needed

### Provider Not Found

```dart
// Ensure all dependencies overridden
ProviderContainer(
  overrides: [
    // Add all required overrides
  ],
)
```

### Camera Tests Failing

- Use emulator with camera support
- Mock with MockCameraController
- Override photoCaptureServiceProvider

### Flaky Tests

- Avoid hardcoded delays
- Use `pumpAndSettle()`
- Remove unnecessary dependencies
- Ensure proper test isolation

## Best Practices

### Writing Good Tests

1. **Use descriptive names**
   ```dart
   testWidgets('should display error message when API fails', ...)
   ```

2. **Follow AAA pattern**
   ```dart
   // Arrange
   final data = MockDataFactory.createDetection();

   // Act
   await tester.pumpWidget(widget);

   // Assert
   expect(find.text('label'), findsOneWidget);
   ```

3. **Test behavior, not implementation**
   ```dart
   // Good
   expect(find.text('Loaded'), findsOneWidget);

   // Bad
   expect(widget.state.isLoaded, isTrue);
   ```

4. **Keep tests focused**
   - One concept per test
   - Use descriptive test names
   - Avoid over-mocking

5. **Test edge cases**
   - Empty states
   - Error states
   - Boundary conditions
   - Large datasets

### Test Organization

```
test/
├── fixtures/          # Test data
├── test_utils/        # Helper functions
├── accessibility/     # A11y tests
├── application/       # Provider tests
├── data/              # Repository tests
├── presentation/      # Widget tests
└── services/          # Service tests
```

### Naming Conventions

- Test files: `*_test.dart`
- Integration tests: `*_test.dart` in `integration_test/`
- Mock classes: `Mock*`
- Test groups: describe the component
- Test cases: describe the behavior

## Performance

### Test Execution Time

Monitor with:
```bash
flutter test --verbose
```

Keep tests fast:
- Use mocks instead of real implementations
- Minimize dependencies
- Avoid unnecessary waits
- Use `pumpAndSettle()` wisely

## Resources

- [Flutter Testing Docs](https://flutter.dev/docs/testing)
- [Integration Testing](https://flutter.dev/docs/testing/integration-tests)
- [Mocktail Docs](https://pub.dev/packages/mocktail)
- [Riverpod Testing](https://riverpod.dev/docs/essentials/testing)
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)

## Contributing

When adding tests:
1. Follow existing patterns
2. Use mock data factory
3. Include success and error cases
4. Test accessibility
5. Keep tests independent
6. Document complex scenarios
7. Ensure deterministic behavior
