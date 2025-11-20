# Testing Quick Reference

Quick lookup guide for common testing tasks.

## Commands

```bash
# Basic test execution
flutter test                          # Run all tests
flutter test --watch                 # Watch mode
flutter test --coverage               # With coverage report
flutter test --verbose                # Verbose output

# Specific tests
flutter test test/presentation/       # Widget tests only
flutter test test/application/providers/ # Provider tests only
flutter test test/accessibility/      # Accessibility tests
flutter test integration_test/        # Integration tests

# Filtering
flutter test --grep="Camera"          # Pattern matching
flutter test --exclude-tags=integration # Exclude tests

# Coverage
flutter test --coverage
lcov --list coverage/lcov.info
open coverage/index.html              # View HTML report
```

## Test Template

### Widget Test
```dart
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('MyScreen Widget Tests', () {
    testWidgets('should display content', (tester) async {
      // Arrange
      await tester.pumpWidget(
        createRiverpodTestWidget(const MyScreen()),
      );

      // Act
      await tester.pumpAndSettle();

      // Assert
      expect(find.text('Content'), findsOneWidget);
    });
  });
}
```

### Provider Test
```dart
void main() {
  test('should fetch data', () async {
    final container = ProviderContainer(
      overrides: [
        repositoryProvider.overrideWithValue(mockRepository),
      ],
    );

    final result = await container.read(myProvider.future);

    expect(result, isNotEmpty);
  });
}
```

### Integration Test
```dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('complete user flow', (tester) async {
    await tester.pumpWidget(const MyApp());

    // Navigate
    await tester.tap(find.byIcon(Icons.camera));
    await tester.pumpAndSettle();

    // Verify
    expect(find.byType(CameraScreen), findsOneWidget);
  });
}
```

## Mock Data

```dart
// Single object
MockDataFactory.createDetection(label: 'lamp', confidence: 0.95)
MockDataFactory.createInventoryItem(id: 1, label: 'lamp')

// Multiple objects
MockDataFactory.createDetections(5)
MockDataFactory.createInventoryItems(10)

// Responses
MockDataFactory.createDetectionResponse(detections: [...])
MockDataFactory.createEnsembleMetrics()

// Edge cases
MockDataFactory.createDetectionWithLowConfidence()
MockDataFactory.createDetectionAtBoundary()
```

## Widget Helpers

```dart
// Create test widget
createRiverpodTestWidget(widget, overrides: [...])
createMaterialTestWidget(widget)
createFullScreenTestWidget(widget)

// Interactions
await tapAndSettle(tester, find.text('Button'))
await enterText(tester, find.byType(TextField), 'text')
await clearText(tester, find.byType(TextField))
await longPressAndSettle(tester, finder)
await scrollToWidget(tester, finder)

// Assertions
expectWidgetExists(find.byType(MyWidget))
expectTextExists('Label')
expectIconExists(Icons.search)
expectMinimumTouchTarget(finder)
expectSemanticLabel('Button')

// Utilities
expectWidgetVisible(finder)
getWidget<MyWidget>(finder)
getWidgetOffset(finder)
expectWidgetCentered(finder, screenSize)
```

## Mocking

### Repository Mocking
```dart
class MockInventoryRepository extends Mock
    implements InventoryRepository {}

final mock = MockInventoryRepository();
when(() => mock.getAll())
    .thenAnswer((_) async => testItems);
```

### Provider Override
```dart
ProviderContainer(
  overrides: [
    inventoryRepositoryProvider.overrideWithValue(mockRepo),
    detectionRepositoryProvider.overrideWithValue(mockDetection),
  ],
)
```

### API Mocking
```dart
final apiClient = FakeApiClient();
apiClient.setupResponse('/path', mockResponse);
apiClient.setupFailure('Network error');
apiClient.getRequestHistory()
```

### Database Mocking
```dart
final fakeDb = FakeAppDatabase();
await fakeDb.insertItem(item)
final items = await fakeDb.getAllItems()
await fakeDb.deleteItem(1)
await fakeDb.clearAllData()
```

## Finders

```dart
// By type
find.byType(MyWidget)

// By text
find.text('Label')

// By icon
find.byIcon(Icons.search)

// By semantic label
find.bySemanticsLabel('Button')

// Multiple
find.byType(Card).at(0)

// Combinations
find.byType(TextField).first
find.byType(TextField).last
find.byType(TextField).evaluate()
```

## Expectations

```dart
// Existence
expect(finder, findsOneWidget)
expect(finder, findsWidgets)
expect(finder, findsNothing)
expect(finder, findsNWidgets(3))

// Equality
expect(result, equals(expected))
expect(result, isNotEmpty)
expect(result, isEmpty)

// Comparisons
expect(value, greaterThan(10))
expect(value, lessThan(100))
expect(value, closeTo(50, 5))

// Types
expect(result, isA<MyType>())
expect(result, isNull)
expect(result, isNotNull)

// Errors
expect(() => function(), throwsException)
expect(() => function(), throwsA(isA<MyException>()))
```

## Annotations

```dart
/// T048 [P] [US1] Widget test for camera screen
/// Purpose: Validate camera screen UI
/// Success Criteria:
/// - Renders camera preview
/// - Capture button works

// Test case structure
// T = Test ID (T048)
// [P] = Priority (P/S/L)
// [US1] = User Story (US1/US2)
```

## Best Practices Checklist

- [ ] Use descriptive test names
- [ ] Follow AAA pattern (Arrange/Act/Assert)
- [ ] Test behavior, not implementation
- [ ] Mock external dependencies
- [ ] Use factory for test data
- [ ] Call pumpAndSettle() after interactions
- [ ] Test error cases
- [ ] Test edge cases
- [ ] Verify accessibility
- [ ] Keep tests independent
- [ ] Avoid hardcoded delays
- [ ] Use semantic finders
- [ ] Document complex tests
- [ ] Run tests before committing
- [ ] Monitor coverage

## File Locations

```
test/
├── fixtures/                    # Test data
├── test_utils/                  # Helpers
├── accessibility/               # A11y tests
├── application/providers/       # Provider tests
├── presentation/                # Widget tests
├── data/repositories/           # Repo tests
└── services/                    # Service tests

integration_test/                # E2E tests

TEST_README.md                   # Full documentation
TESTING_GUIDE.md                 # Detailed guide
```

## Debugging

```bash
# Verbose output
flutter test --verbose

# Single test
flutter test test/file.dart::test_name

# Slow animations
flutter test --slow-start-animation

# Keep app running
flutter test --keep-app-running

# Random seed
flutter test --test-randomize-ordering-seed=12345
```

## Coverage Goals

- Overall: 80%+
- Critical paths: 95%+
- UI layer: 90%+
- Business logic: 85%+

## Common Issues

| Issue | Solution |
|-------|----------|
| Widget not found | Ensure pumpAndSettle() called |
| Test timeout | Use proper waits, avoid hardcoded delays |
| Provider error | Check all overrides provided |
| Flaky tests | Avoid timing dependencies |
| Camera tests fail | Use emulator with camera support |

## Resources

- [TEST_README.md](./TEST_README.md) - Full documentation
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Detailed guide
- [Flutter Testing](https://flutter.dev/docs/testing)
- [Integration Testing](https://flutter.dev/docs/testing/integration-tests)
- [Mocktail](https://pub.dev/packages/mocktail)
