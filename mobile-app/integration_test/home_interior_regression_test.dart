import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:home_inventory/main.dart' as app;
import 'package:home_inventory/data/database/app_database.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:home_inventory/data/repositories/detection_repository.dart';
import 'package:home_inventory/domain/models/detection.dart';
import 'package:home_inventory/domain/models/bounding_box.dart';
import 'package:home_inventory/domain/models/ensemble_details.dart';
import 'package:home_inventory/data/api/api_client.dart';
import 'package:home_inventory/presentation/home/inventory_feed_screen.dart';
import 'package:home_inventory/presentation/search/search_screen.dart';
import 'package:home_inventory/domain/services/photo_capture_service.dart';
import 'package:home_inventory/application/providers/camera_providers.dart';
import 'package:fpdart/fpdart.dart';
import 'package:mockito/mockito.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

// Mock PhotoCaptureService
class MockPhotoCaptureService extends Mock implements PhotoCaptureService {
  String? mockImagePath;

  @override
  Future<Either<Failure, File>> capturePhoto() async {
    if (mockImagePath != null) {
      final directory = await getApplicationDocumentsDirectory();
      final path = p.join(directory.path, 'test_photos', mockImagePath!);
      final file = File(path);
      if (!await file.parent.exists()) {
        await file.parent.create(recursive: true);
      }
      // Create a dummy file for the test to succeed
      await file.writeAsString('mock image content');
      return right(file);
    }
    return left(const Failure.camera(message: 'Mock image path not set'));
  }

  @override
  Future<Either<Failure, void>> initialize() async => right(null);

  @override
  Future<void> dispose() async {}

  @override
  Future<bool> hasPermission() async => true;

  @override
  Future<bool> requestPermission() async => true;
}

// Mock API client for testing various scenarios
class MockApiClientWithScenarios implements ApiClient {
  final Map<String, DetectionResponse> scenarios;

  MockApiClientWithScenarios(this.scenarios);

  @override
  Future<DetectionResponse> detect(String imagePath) async {
    await Future.delayed(const Duration(milliseconds: 100)); // Simulate network delay

    final scenarioKey = p.basenameWithoutExtension(imagePath);
    if (scenarios.containsKey(scenarioKey)) {
      return scenarios[scenarioKey]!;
    }

    return DetectionResponse(
      success: true,
      detections: [],
      ensembleMode: 'baseline_2provider',
      processingTimeMs: 100,
    );
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Home Interior Regression Test Suite', () {
    late AppDatabase database;
    late MockPhotoCaptureService mockPhotoCaptureService;

    setUp(() async {
      database = AppDatabase.forTesting();
      mockPhotoCaptureService = MockPhotoCaptureService();
    });

    tearDown(() async {
      await database.close();
      // Clean up mock files
      final directory = await getApplicationDocumentsDirectory();
      final testPhotosDir = Directory(p.join(directory.path, 'test_photos'));
      if (await testPhotosDir.exists()) {
        await testPhotosDir.delete(recursive: true);
      }
    });

    testWidgets('Scenario 1: Living Room - Sofa, Coffee Table, TV', (tester) async {
      final mockScenarios = {
        'living_room': DetectionResponse(
          success: true,
          detections: [
            Detection(
              id: 'det-sofa',
              label: 'Sofa',
              confidence: 0.95,
              boundingBox: BoundingBox(x: 0.1, y: 0.1, width: 0.5, height: 0.4),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.95),
            ),
            Detection(
              id: 'det-coffee-table',
              label: 'Coffee Table',
              confidence: 0.90,
              boundingBox: BoundingBox(x: 0.3, y: 0.5, width: 0.3, height: 0.2),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.90),
            ),
            Detection(
              id: 'det-tv',
              label: 'Television',
              confidence: 0.88,
              boundingBox: BoundingBox(x: 0.6, y: 0.2, width: 0.2, height: 0.3),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.88),
            ),
          ],
          ensembleMode: 'baseline_2provider',
          processingTimeMs: 1500,
        ),
      };

      mockPhotoCaptureService.mockImagePath = 'living_room.jpg';

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            apiClientProvider.overrideWithValue(MockApiClientWithScenarios(mockScenarios)),
            photoCaptureServiceProvider.overrideWithValue(mockPhotoCaptureService),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Tap camera button in bottom nav
      final cameraButton = find.byIcon(Icons.add_circle_outline);
      expect(cameraButton, findsOneWidget);
      await tester.tap(cameraButton);
      await tester.pumpAndSettle();

      // Act: Capture photo
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pump(); // Start capture

      // Wait for API response and detection processing
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Save detections
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Verify items in home feed
      expect(find.byType(InventoryFeedScreen), findsOneWidget);
      expect(find.text('Sofa'), findsOneWidget);
      expect(find.text('Coffee Table'), findsOneWidget);
      expect(find.text('Television'), findsOneWidget);

      // Verify search
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();
      expect(find.byType(SearchScreen), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Sofa');
      await tester.pumpAndSettle();
      expect(find.text('Sofa'), findsOneWidget);
      expect(find.text('Coffee Table'), findsNothing);
    });

    testWidgets('Scenario 2: Kitchen - Refrigerator, Oven, Microwave', (tester) async {
      final mockScenarios = {
        'kitchen': DetectionResponse(
          success: true,
          detections: [
            Detection(
              id: 'det-fridge',
              label: 'Refrigerator',
              confidence: 0.98,
              boundingBox: BoundingBox(x: 0.1, y: 0.1, width: 0.5, height: 0.8),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.98),
            ),
            Detection(
              id: 'det-oven',
              label: 'Oven',
              confidence: 0.92,
              boundingBox: BoundingBox(x: 0.6, y: 0.4, width: 0.3, height: 0.4),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.92),
            ),
            Detection(
              id: 'det-microwave',
              label: 'Microwave',
              confidence: 0.85,
              boundingBox: BoundingBox(x: 0.7, y: 0.2, width: 0.2, height: 0.2),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.85),
            ),
          ],
          ensembleMode: 'baseline_2provider',
          processingTimeMs: 1200,
        ),
      };

      mockPhotoCaptureService.mockImagePath = 'kitchen.jpg';

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            apiClientProvider.overrideWithValue(MockApiClientWithScenarios(mockScenarios)),
            photoCaptureServiceProvider.overrideWithValue(mockPhotoCaptureService),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Tap camera button in bottom nav
      final cameraButton = find.byIcon(Icons.add_circle_outline);
      expect(cameraButton, findsOneWidget);
      await tester.tap(cameraButton);
      await tester.pumpAndSettle();

      // Act: Capture photo
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pump(); // Start capture

      // Wait for API response and detection processing
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Save detections
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Verify items in home feed
      expect(find.byType(InventoryFeedScreen), findsOneWidget);
      expect(find.text('Refrigerator'), findsOneWidget);
      expect(find.text('Oven'), findsOneWidget);
      expect(find.text('Microwave'), findsOneWidget);

      // Verify search
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();
      expect(find.byType(SearchScreen), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Oven');
      await tester.pumpAndSettle();
      expect(find.text('Oven'), findsOneWidget);
      expect(find.text('Refrigerator'), findsNothing);
    });

    testWidgets('Scenario 3: Bedroom - Bed, Lamp, Wardrobe', (tester) async {
      final mockScenarios = {
        'bedroom': DetectionResponse(
          success: true,
          detections: [
            Detection(
              id: 'det-bed',
              label: 'Bed',
              confidence: 0.97,
              boundingBox: BoundingBox(x: 0.1, y: 0.1, width: 0.7, height: 0.6),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.97),
            ),
            Detection(
              id: 'det-lamp',
              label: 'Lamp',
              confidence: 0.90,
              boundingBox: BoundingBox(x: 0.8, y: 0.2, width: 0.1, height: 0.3),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.90),
            ),
            Detection(
              id: 'det-wardrobe',
              label: 'Wardrobe',
              confidence: 0.89,
              boundingBox: BoundingBox(x: 0.05, y: 0.05, width: 0.2, height: 0.8),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.89),
            ),
          ],
          ensembleMode: 'baseline_2provider',
          processingTimeMs: 1300,
        ),
      };

      mockPhotoCaptureService.mockImagePath = 'bedroom.jpg';

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            apiClientProvider.overrideWithValue(MockApiClientWithScenarios(mockScenarios)),
            photoCaptureServiceProvider.overrideWithValue(mockPhotoCaptureService),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Act: Tap camera button in bottom nav
      final cameraButton = find.byIcon(Icons.add_circle_outline);
      expect(cameraButton, findsOneWidget);
      await tester.tap(cameraButton);
      await tester.pumpAndSettle();

      // Act: Capture photo
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pump(); // Start capture

      // Wait for API response and detection processing
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Save detections
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Verify items in home feed
      expect(find.byType(InventoryFeedScreen), findsOneWidget);
      expect(find.text('Bed'), findsOneWidget);
      expect(find.text('Lamp'), findsOneWidget);
      expect(find.text('Wardrobe'), findsOneWidget);

      // Verify search
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();
      expect(find.byType(SearchScreen), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Lamp');
      await tester.pumpAndSettle();
      expect(find.text('Lamp'), findsOneWidget);
      expect(find.text('Bed'), findsNothing);
    });

    testWidgets('Scenario 4: Item Details and Label Editing', (tester) async {
      final mockScenarios = {
        'item_for_editing': DetectionResponse(
          success: true,
          detections: [
            Detection(
              id: 'det-chair',
              label: 'Chair',
              confidence: 0.95,
              boundingBox: BoundingBox(x: 0.1, y: 0.1, width: 0.5, height: 0.4),
              ensembleDetails: EnsembleDetails(labelConsensus: 'unanimous', providerAgreement: 2, fusedConfidence: 0.95),
            ),
          ],
          ensembleMode: 'baseline_2provider',
          processingTimeMs: 1000,
        ),
      };

      mockPhotoCaptureService.mockImagePath = 'item_for_editing.jpg';

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            appDatabaseProvider.overrideWithValue(database),
            apiClientProvider.overrideWithValue(MockApiClientWithScenarios(mockScenarios)),
            photoCaptureServiceProvider.overrideWithValue(mockPhotoCaptureService),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Capture item
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.circle));
      await tester.pump();
      await tester.pumpAndSettle(const Duration(seconds: 2));
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Verify item in home feed and tap it
      expect(find.byType(InventoryFeedScreen), findsOneWidget);
      expect(find.text('Chair'), findsOneWidget);
      await tester.tap(find.text('Chair'));
      await tester.pumpAndSettle();

      // Assert: Item Detail Screen displayed
      expect(find.byType(ItemDetailScreen), findsOneWidget);
      expect(find.text('Chair'), findsOneWidget);

      // Act: Tap Edit Labels button
      await tester.tap(find.byIcon(Icons.edit));
      await tester.pumpAndSettle();

      // Act: Add custom label
      expect(find.text('Add Label'), findsOneWidget);
      await tester.enterText(find.bySemanticsLabel('Key (optional)'), 'Color');
      await tester.enterText(find.bySemanticsLabel('Value'), 'Red');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      // Verify label appears on Item Detail Screen
      expect(find.text('Color: Red'), findsOneWidget);

      // Navigate back to home and search for the new label
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Red');
      await tester.pumpAndSettle();
      expect(find.text('Chair'), findsOneWidget);
      expect(find.text('Color: Red'), findsOneWidget);
    });
  });
}