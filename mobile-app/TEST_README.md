# Home Inventory App - Comprehensive Test Suite

Complete testing solution for the Flutter mobile app using flutter_test, integration_test, and mocktail.

## Overview

This test suite provides comprehensive coverage across:
- Widget/UI tests (Unit-level testing)
- Provider/state management tests
- Repository and service layer tests
- End-to-end integration tests
- Accessibility compliance testing

## Test Structure

```
mobile-app/test/
├── fixtures/
│   ├── mock_data.dart          # Test data factories and fixtures
│   ├── fake_database.dart      # In-memory database mock
│   └── mock_api_client.dart    # API client mocks
├── test_utils/
│   └── test_widget_helpers.dart # Widget test utilities and helpers
├── accessibility/
│   └── accessibility_tests.dart # A11y compliance tests
├── application/providers/
│   ├── inventory_providers_test.dart     # Inventory state tests
│   ├── detection_providers_test.dart     # Detection state tests
│   ├── label_providers_test.dart         # Label management tests
│   └── search_providers_test.dart        # Search functionality tests
├── presentation/
│   ├── camera/
│   │   └── camera_screen_test.dart       # Camera widget tests
│   ├── detection/
│   │   └── detection_results_screen_widget_test.dart
│   ├── home/
│   │   └── inventory_feed_screen_widget_test.dart
│   ├── common/
│   │   └── widgets_test.dart             # Common widget tests
│   ├── search/
│   │   └── search_screen_test.dart       # Search widget tests
│   └── items/
│       └── item_detail_screen_test.dart  # Item detail widget tests
├── data/repositories/
│   ├── inventory_repository_test.dart
│   ├── detection_repository_test.dart
│   └── label_repository_test.dart
└── services/
    ├── image_processing_service_comprehensive_test.dart
    └── sync_service_test.dart

integration_test/
├── complete_detection_flow_test.dart      # Full capture→detect→save→inventory
├── search_and_filter_flow_test.dart       # Search and filtering flows
├── offline_sync_test.dart                 # Offline sync functionality
└── error_recovery_test.dart               # Error handling and recovery
```

## Running Tests

### All Unit/Widget Tests
```bash
# Run all tests
flutter test

# Run with verbose output
flutter test --verbose

# Run specific test file
flutter test test/presentation/camera/camera_screen_test.dart

# Run tests matching pattern
flutter test --name "should render camera preview"

# Watch mode (re-runs on file changes)
flutter test --watch
```

### Coverage Reports
```bash
# Generate coverage report
flutter test --coverage

# Generate HTML coverage report (requires lcov)
flutter test --coverage
lcov --list coverage/lcov.info

# Open coverage in browser
open coverage/index.html
```

### Integration Tests
```bash
# Run specific integration test
flutter test integration_test/complete_detection_flow_test.dart

# Run all integration tests
flutter test integration_test/

# Run on physical device
flutter test integration_test/ --target=integration_test/app_test.dart

# Run with browser (web testing)
flutter test integration_test/ -d chrome
```

### Test Filtering
```bash
# Run only detection tests
flutter test --grep="Detection"

# Run excluding integration tests
flutter test --exclude-tags=integration

# Run only accessibility tests
flutter test test/accessibility/
```

## Test Categories

### Widget Tests
Test individual UI components and screens in isolation:
- **CameraScreen**: Camera preview, flash control, capture button
- **DetectionResultsScreen**: Bounding boxes, object selection, confidence display
- **InventoryFeedScreen**: Grid layout, pull-to-refresh, empty states
- **SearchScreen**: Input handling, result filtering, clear functionality
- **ItemDetailScreen**: Image display, labels, edit/delete actions
- **Common Widgets**: LoadingIndicator, ErrorView, CustomAppBar

### Provider Tests
Test Riverpod state management and data flow:
- **InventoryItemsProvider**: Item fetching, caching, invalidation
- **SearchInventoryProvider**: Search filtering, case-insensitivity
- **DetectObjectsProvider**: API integration, error handling
- **SelectedDetectionsProvider**: Selection state management
- **EnsembleMetricsProvider**: Metrics calculation

### Repository Tests
Test data persistence and retrieval:
- **InventoryRepository**: CRUD operations, pagination
- **DetectionRepository**: API calls, response parsing
- **LabelRepository**: Label management, frequency tracking
- **SyncRepository**: Offline sync, conflict resolution

### Service Tests
Test business logic and utilities:
- **ImageProcessingService**: Validation, compression, resizing, rotation
- **SyncService**: Background sync, offline queue management
- **ImagePickerService**: Image selection and handling

### Integration Tests
Test complete user flows:
- **Complete Detection Flow**: Camera → Detect → Select → Save → Inventory
- **Search and Filter**: Searching items, applying filters
- **Offline Sync**: Making changes offline, syncing when online
- **Error Recovery**: Network errors, permission denial, recovery

### Accessibility Tests
Test WCAG compliance:
- Semantic labels and descriptions
- Touch target sizes (48x48dp minimum)
- Color contrast ratios
- Screen reader support
- Keyboard navigation
- Text scaling support

## Test Utilities

### Mock Data Factory
```dart
// Create test detections
final detection = MockDataFactory.createDetection(
  label: 'lamp',
  confidence: 0.95,
);

// Create test inventory items
final items = MockDataFactory.createInventoryItems(5);

// Create detection responses
final response = MockDataFactory.createDetectionResponse(
  detections: detections,
);
```

### Widget Test Helpers
```dart
// Create test widget with providers
createRiverpodTestWidget(MyWidget(), overrides: [...])

// Tap and wait for animations
await tapAndSettle(tester, find.text('Button'));

// Enter text in field
await enterText(tester, find.byType(TextField), 'search');

// Verify touch target size
expectMinimumTouchTarget(find.byIcon(Icons.camera));

// Check semantic labels
expectSemanticLabel('Camera Permission');
```

## Mocking Strategy

### API Client Mocking
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
```

### Database Mocking
```dart
final fakeDb = FakeAppDatabase();

// Simulate database operations
await fakeDb.insertItem(item);
await fakeDb.searchItemsByLabel('lamp');
final items = await fakeDb.getAllItems();
```

### Provider Overrides
```dart
ProviderContainer(
  overrides: [
    inventoryRepositoryProvider.overrideWithValue(mockRepository),
    detectionRepositoryProvider.overrideWithValue(mockDetection),
  ],
)
```

## Best Practices

### Widget Testing
- Test user interactions, not implementation
- Use semantic finders (byType, byIcon, byText)
- Wait for animations with pumpAndSettle()
- Test error states and edge cases
- Verify accessibility attributes

### Provider Testing
- Test with ProviderContainer for isolation
- Mock external dependencies
- Test loading, success, and error states
- Verify caching behavior
- Test invalidation and refresh

### Repository Testing
- Mock underlying data sources
- Test CRUD operations
- Test error handling
- Test pagination and filtering
- Verify data consistency

### Service Testing
- Test with real data when possible
- Test edge cases and boundary conditions
- Test error scenarios
- Verify resource cleanup
- Test async operations

### Accessibility Testing
- Always include semantic labels
- Test with screen reader enabled
- Verify touch target sizes
- Check color contrast
- Test keyboard navigation
- Test with text scaling enabled

## Continuous Integration

### GitHub Actions Configuration
See `.github/workflows/flutter_test.yml` for:
- Automated test execution on push/PR
- Coverage report generation
- Failure notifications
- Performance benchmarking

### Local Pre-commit Checks
```bash
# Run before committing
flutter test --coverage
flutter analyze
```

## Troubleshooting

### Common Issues

**Tests timeout**
```bash
flutter test --verbose --test-randomize-ordering-seed=12345
```

**Widget not found**
- Ensure pumpAndSettle() is called
- Check widget hierarchy
- Verify finder is correct

**Provider errors**
- Ensure all overrides are provided
- Check provider dependencies
- Verify mock implementations

**Camera test failures**
- Run on emulator with camera support
- Use MockCameraController
- Mock PhotoCaptureService

### Debug Tips
```dart
// Print widget tree
debugPrintBeginFrame = true;

// Print finder matches
print(find.byType(MyWidget).evaluate());

// Capture screenshot
await tester.takeScreenshot('screenshot.png');

// Verbose output
flutter test --verbose
```

## Performance Testing

### Test Execution Time
Monitor test suite performance:
```bash
flutter test --reporter=compact --verbose
```

### Memory Profiling
Test suite should not leak memory:
```bash
flutter test --profile
```

### Coverage Goals
Target coverage metrics:
- **Overall**: 80%+ code coverage
- **Critical paths**: 95%+ coverage
- **UI layer**: 90%+ widget coverage
- **Business logic**: 85%+ service coverage

## Extending Tests

### Adding New Widget Tests
1. Create test file in appropriate directory
2. Import mock data and helpers
3. Create test group with descriptive name
4. Write individual test cases
5. Verify accessibility

### Adding Integration Tests
1. Create test in `integration_test/`
2. Use `IntegrationTestWidgetsFlutterBinding.ensureInitialized()`
3. Test complete user flows
4. Verify all assertions

### Adding Accessibility Tests
1. Include in `test/accessibility/`
2. Test semantic labels
3. Verify touch targets
4. Check color contrast
5. Test keyboard navigation

## References

- [Flutter Testing Documentation](https://flutter.dev/docs/testing)
- [Integration Testing Guide](https://flutter.dev/docs/testing/integration-tests)
- [Mocktail Documentation](https://pub.dev/packages/mocktail)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design Accessibility](https://material.io/design/usability/accessibility.html)

## Contributing

When adding new tests:
1. Follow existing patterns and naming conventions
2. Use mock data factory for consistent test data
3. Include both success and error cases
4. Test accessibility where applicable
5. Keep tests focused and independent
6. Document complex test scenarios
7. Ensure tests are deterministic (no flakiness)

## Contact

For questions about testing strategy and implementation, refer to the main project documentation.
