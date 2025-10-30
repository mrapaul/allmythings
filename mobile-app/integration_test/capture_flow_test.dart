import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:home_inventory/main.dart' as app;
import 'package:home_inventory/data/database/app_database.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/**
 * T050 [P] [US1] Integration test for photo capture flow
 *
 * Purpose: Validate end-to-end camera → detection → save → feed workflow
 *
 * Success Criteria:
 * - Navigate to camera from home screen
 * - Capture photo successfully
 * - Receive detection results from API
 * - Save detections to local database
 * - View item in inventory feed
 * - All state transitions work correctly
 */

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Photo Capture Flow Integration Tests', () {
    late AppDatabase database;

    setUp(() async {
      // Initialize in-memory database for testing
      database = AppDatabase.forTesting();
    });

    tearDown(() async {
      await database.close();
    });

    testWidgets('complete capture flow: camera → detect → save → feed', (tester) async {
      // Arrange: Launch app with test database
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Assert: Start on home screen (empty state)
      expect(find.text('No Items Yet'), findsOneWidget);
      expect(find.text('Tap the camera to get started'), findsOneWidget);

      // Act: Tap camera button in bottom nav
      final cameraButton = find.byIcon(Icons.add_circle_outline);
      expect(cameraButton, findsOneWidget);
      await tester.tap(cameraButton);
      await tester.pumpAndSettle();

      // Assert: Camera screen opened
      expect(find.byType(CameraPreview), findsOneWidget);
      expect(find.byIcon(Icons.circle), findsOneWidget); // Capture button

      // Act: Capture photo
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pump(); // Start capture

      // Assert: Loading state shown during API call
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Wait for API response and detection processing
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Assert: Detection results screen displayed
      expect(find.text('Detection Results'), findsOneWidget);
      expect(find.text('Detected Objects'), findsOneWidget);

      // Verify detection displayed (actual object depends on test image)
      final detectionCards = find.byType(Card);
      expect(detectionCards.evaluate().length, greaterThan(0));

      // Act: Save detections by tapping Done
      await tester.tap(find.text('Done'));
      await tester.pump();

      // Assert: Loading while saving
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.pumpAndSettle();

      // Assert: Navigated back to home feed
      expect(find.byType(InventoryFeedScreen), findsOneWidget);

      // Assert: Item now appears in feed grid
      final gridItems = find.byType(InventoryCard);
      expect(gridItems, findsOneWidget); // At least one item

      // Verify database contains saved item
      final items = await database.select(database.inventoryItems).get();
      expect(items.length, 1);
      expect(items.first.photoPath, isNotEmpty);

      // Verify labels created
      final labels = await database.select(database.labels).get();
      expect(labels.length, greaterThan(0)); // Auto-label from detection
    });

    testWidgets('should handle API failure gracefully', (tester) async {
      // Arrange: Launch app
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            // Override API client to simulate failure
            apiClientProvider.overrideWithValue(
              MockApiClient(shouldFail: true),
            ),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Navigate to camera and capture
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Assert: Error dialog shown
      expect(find.text('Detection Failed'), findsOneWidget);
      expect(find.text('Unable to detect objects'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);

      // Act: Tap Retry
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      // Assert: Back to camera screen for another attempt
      expect(find.byType(CameraPreview), findsOneWidget);
    });

    testWidgets('should handle no detections returned', (tester) async {
      // Arrange: Launch app with mock returning empty detections
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            apiClientProvider.overrideWithValue(
              MockApiClient(emptyResponse: true),
            ),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Capture photo
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 5));

      // Assert: Empty state shown
      expect(find.text('No Objects Detected'), findsOneWidget);
      expect(find.text('Retake Photo'), findsOneWidget);

      // Act: Retake
      await tester.tap(find.text('Retake Photo'));
      await tester.pumpAndSettle();

      // Assert: Back to camera
      expect(find.byType(CameraPreview), findsOneWidget);
    });

    testWidgets('should persist multiple captures across sessions', (tester) async {
      // Arrange: Launch app
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: First capture
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 10));
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Assert: 1 item in feed
      expect((await database.select(database.inventoryItems).get()).length, 1);

      // Act: Second capture
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 10));
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Assert: 2 items in feed
      expect((await database.select(database.inventoryItems).get()).length, 2);

      // Assert: Both items visible in grid
      final gridItems = find.byType(InventoryCard);
      expect(gridItems.evaluate().length, 2);
    });

    testWidgets('should maintain state when navigating between tabs', (tester) async {
      // Arrange: Launch app with 1 saved item
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Add item via capture flow
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 10));
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Assert: 1 item in home
      expect(find.byType(InventoryCard), findsOneWidget);

      // Act: Navigate to Search tab
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();

      // Assert: Search screen shown
      expect(find.byType(SearchScreen), findsOneWidget);

      // Act: Navigate back to Home
      await tester.tap(find.byIcon(Icons.home_outlined));
      await tester.pumpAndSettle();

      // Assert: Item still visible (state preserved)
      expect(find.byType(InventoryCard), findsOneWidget);
    });

    testWidgets('should update feed immediately after saving', (tester) async {
      // Arrange: Launch app
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Assert: Empty state initially
      expect(find.text('No Items Yet'), findsOneWidget);

      // Act: Capture and save
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 10));
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Assert: Feed updated immediately (no empty state)
      expect(find.text('No Items Yet'), findsNothing);
      expect(find.byType(InventoryCard), findsOneWidget);
    });

    testWidgets('should handle camera permission denied', (tester) async {
      // Arrange: Launch app with denied permissions
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            cameraPermissionProvider.overrideWithValue(
              AsyncValue.data(false), // Denied
            ),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Tap camera button
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();

      // Assert: Permission request screen shown
      expect(find.text('Camera Permission Required'), findsOneWidget);
      expect(find.text('Grant Permission'), findsOneWidget);

      // Capture button not accessible
      expect(find.byIcon(Icons.circle), findsNothing);
    });

    testWidgets('should display detection metadata correctly', (tester) async {
      // Arrange: Launch app
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Capture photo
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Assert: Detection metadata displayed
      expect(find.text('Provider Agreement'), findsOneWidget);
      expect(find.textContaining('providers agree'), findsOneWidget);
      expect(find.textContaining('%'), findsWidgets); // Confidence percentages

      // Ensemble info shown
      expect(find.textContaining('Unanimous'), findsAny);
      expect(find.textContaining('Majority'), findsAny);
    });
  });
}

/// Mock API client for testing various scenarios
class MockApiClient {
  final bool shouldFail;
  final bool emptyResponse;

  MockApiClient({this.shouldFail = false, this.emptyResponse = false});

  Future<DetectionResponse> detect(String imagePath) async {
    await Future.delayed(const Duration(seconds: 2)); // Simulate network delay

    if (shouldFail) {
      throw Exception('API request failed');
    }

    if (emptyResponse) {
      return DetectionResponse(
        success: true,
        detections: [],
        ensembleMode: 'baseline_2provider',
        processingTimeMs: 1500,
      );
    }

    // Return mock detection
    return DetectionResponse(
      success: true,
      detections: [
        Detection(
          id: 'mock-1',
          label: 'Test Object',
          confidence: 0.90,
          boundingBox: BoundingBox(x: 0.1, y: 0.2, width: 0.3, height: 0.4),
          ensembleDetails: EnsembleDetails(
            labelConsensus: 'unanimous',
            providerAgreement: 2,
            fusedConfidence: 0.90,
          ),
        ),
      ],
      ensembleMode: 'baseline_2provider',
      processingTimeMs: 1500,
    );
  }
}
