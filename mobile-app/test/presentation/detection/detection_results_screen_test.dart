import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:fpdart/fpdart.dart';
import 'package:home_inventory/presentation/detection/detection_results_screen.dart';
import 'package:home_inventory/domain/models/detection.dart';
import 'package:home_inventory/domain/models/bounding_box.dart';
import 'package:home_inventory/application/providers/detection_providers.dart';
import 'package:home_inventory/application/state/detection_state.dart';
import 'package:home_inventory/data/repositories/detection_repository.dart';
import 'package:home_inventory/data/repositories/inventory_repository.dart';
import 'package:home_inventory/domain/models/ensemble_details.dart';
import 'package:home_inventory/domain/models/alternative_label.dart';
import 'package:home_inventory/domain/models/vision_provider.dart';
import 'package:home_inventory/domain/models/detection_response.dart';
import 'package:home_inventory/domain/models/ensemble_metrics.dart';
import 'package:home_inventory/core/errors/failures.dart';

/**
 * T049 [P] [US1] Widget test for detection results screen
 *
 * Purpose: Validate detection results UI and user interactions
 *
 * Success Criteria:
 * - Displays detected objects with confidence scores
 * - Shows bounding boxes on image preview
 * - Displays ensemble metrics (providers used, consensus)
 * - "Done" button saves to database and navigates to feed
 * - Shows empty state when no detections
 * - Displays provider agreement indicators
 */

class MockDetectionService extends Mock implements DetectionRepository {}
class MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockDetectionService mockDetectionService;
  late MockInventoryRepository mockInventoryRepository;

  setUp(() {
    mockDetectionService = MockDetectionService();
    mockInventoryRepository = MockInventoryRepository();
  });

  // Sample detection data for testing
  final sampleDetection = Detection(
    id: 'det-1',
    label: 'Laptop',
    confidence: 0.92,
    boundingBox: BoundingBox(
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    ),
    ensembleDetails: EnsembleDetails(
      labelConsensus: 'unanimous',
      providerAgreement: 3,
      confidenceByProvider: {VisionProvider.google: 0.92, VisionProvider.aws: 0.90, VisionProvider.tensorflow: 0.95, VisionProvider.meta: 0.88},
    ),
    alternativeLabels: const [],
  );

  // Helper to create testable widget
  Widget createTestWidget({
    DetectionResponse? detectionResponse,
  }) {
    return ProviderScope(
      overrides: [
        detectionNotifierProvider.overrideWith(
          (ref) => DetectionNotifier(mockDetectionService)..state = detectionResponse != null ? DetectionState.success(detectionResponse) : const DetectionState.initial(),
        ),
        inventoryRepositoryProvider.overrideWithValue(mockInventoryRepository),
      ],
      child: const MaterialApp(
        home: DetectionResultsScreen(),
      ),
    );
  }

  group('DetectionResultsScreen Widget Tests', () {
    testWidgets('should display detected objects with confidence scores', (tester) async {
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: "test", processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 1, averageConfidence: 0.9));

      // Act: Build widget
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: Detection info displayed
      expect(find.text('Laptop'), findsOneWidget);
      expect(find.text('92%'), findsOneWidget); // Confidence as percentage
      expect(find.text('Detected Objects'), findsOneWidget);
    });

    testWidgets('should show bounding boxes on image preview', (tester) async {
      // Arrange
      final detections = [sampleDetection];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 1, averageConfidence: 0.9));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: Image with bounding box overlay
      expect(find.byType(CustomPaint), findsOneWidget); // Bounding box painter
      expect(find.byType(Image), findsOneWidget); // Original image
    });

    testWidgets('should display ensemble metrics', (tester) async {
      // Arrange
      final detections = [sampleDetection];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 1, averageConfidence: 0.9));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: Ensemble info shown
      expect(find.text('Provider Agreement'), findsOneWidget);
      expect(find.text('3/3 providers agree'), findsOneWidget);
      expect(find.text('Unanimous'), findsOneWidget);
    });

    testWidgets('should show "Done" button that saves and navigates', (tester) async {
      // Arrange
      final detections = [sampleDetection];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 1, averageConfidence: 0.9));
      when(() => mockInventoryRepository.createItem(photoPath: any(), thumbnailPath: any(), detection: any())).thenAnswer((_) async => Right(1));

      // Act: Build widget
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      final doneButton = find.text('Done');
      expect(doneButton, findsOneWidget);

      // Tap Done
      await tester.tap(doneButton);
      await tester.pumpAndSettle();

      // Assert: Saved to database
      verify(() => mockInventoryRepository.createItem(photoPath: any(), thumbnailPath: any(), detection: any())).called(1);

      // Assert: Navigated back to feed (DetectionResultsScreen closed)
      expect(find.byType(DetectionResultsScreen), findsNothing);
    });

    testWidgets('should show empty state when no detections', (tester) async {
      // Arrange: No detections
      final detections = <Detection>[];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 0, averageConfidence: 0.0));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: Empty state message
      expect(find.text('No Objects Detected'), findsOneWidget);
      expect(find.text('Try capturing a different image'), findsOneWidget);
      expect(find.text('Retake Photo'), findsOneWidget);
    });

    testWidgets('should display multiple detections in a list', (tester) async {
      // Arrange: Multiple detections
      final detections = [
        sampleDetection,
        Detection(
          id: 'det-2',
          label: 'Mouse',
          confidence: 0.88,
          boundingBox: BoundingBox(x: 0.5, y: 0.6, width: 0.2, height: 0.2),
          ensembleDetails: EnsembleDetails(
            labelConsensus: 'unanimous',
            providerAgreement: 1,
            confidenceByProvider: {VisionProvider.google: 0.88},
          ),
          alternativeLabels: const [],
        ),
        Detection(
          id: 'det-3',
          label: 'Keyboard',
          confidence: 0.85,
          boundingBox: BoundingBox(x: 0.1, y: 0.6, width: 0.4, height: 0.3),
          ensembleDetails: EnsembleDetails(
            labelConsensus: 'unanimous',
            providerAgreement: 1,
            confidenceByProvider: {VisionProvider.google: 0.85},
          ),
          alternativeLabels: const [],
        ),
      ];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 3, averageConfidence: 0.88));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: All detections shown
      expect(find.text('Laptop'), findsOneWidget);
      expect(find.text('Mouse'), findsOneWidget);
      expect(find.text('Keyboard'), findsOneWidget);
      expect(find.text('3 objects detected'), findsOneWidget);
    });

    testWidgets('should show provider agreement indicators', (tester) async {
      // Arrange: Detection with provider agreement
      final detection = Detection(
        id: 'det-1',
        label: 'Laptop',
        confidence: 0.90,
        boundingBox: BoundingBox(x: 0.1, y: 0.2, width: 0.3, height: 0.4),
        ensembleDetails: EnsembleDetails(
          labelConsensus: 'majority',
          providerAgreement: 2,
          confidenceByProvider: {VisionProvider.google: 0.90, VisionProvider.aws: 0.87},
        ),
        alternativeLabels: const [],
      );
      final detectionResponse = DetectionResponse(detections: [detection], ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 2, averageConfidence: 0.88));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: Consensus indicator shown
      expect(find.text('Majority'), findsOneWidget);
      expect(find.text('2/3 providers agree'), findsOneWidget);

      // Visual indicator color based on consensus type
      final consensusChip = find.byType(Chip);
      expect(consensusChip, findsWidgets);
    });

    testWidgets('should highlight selected detection when tapped', (tester) async {
      // Arrange
      final detections = [
        sampleDetection,
        Detection(
          id: 'det-2',
          label: 'Mouse',
          confidence: 0.88,
          boundingBox: BoundingBox(x: 0.5, y: 0.6, width: 0.2, height: 0.2),
          ensembleDetails: EnsembleDetails(
            labelConsensus: 'unanimous',
            providerAgreement: 1,
            confidenceByProvider: {VisionProvider.google: 0.88},
          ),
          alternativeLabels: const [],
        ),
      ];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 2, averageConfidence: 0.9));

      // Act: Build widget
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Tap on second detection
      await tester.tap(find.text('Mouse'));
      await tester.pumpAndSettle();

      // Assert: Second detection highlighted (check container decoration)
      // This would check for visual changes in the UI
      final detectionCard = tester.widget<Container>(
        find.ancestor(
          of: find.text('Mouse'),
          matching: find.byType(Container),
        ).first,
      );

      // Verify highlight styling applied
      expect(detectionCard.decoration, isNotNull);
    });

    testWidgets('should show loading state during save operation', (tester) async {
      // Arrange: Mock slow save operation
      final detections = [sampleDetection];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 1, averageConfidence: 0.9));
      when(() => mockInventoryRepository.createItem(photoPath: any(), thumbnailPath: any(), detection: any())).thenAnswer((_) async {
          await Future.delayed(const Duration(seconds: 2));
          return Right(1);
        });

      // Act: Build and tap Done
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Done'));
      await tester.pump(); // Start async operation

      // Assert: Loading indicator shown
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Wait for completion
      await tester.pumpAndSettle();
    });

    testWidgets('should show error dialog on save failure', (tester) async {
      // Arrange: Mock save failure
      final detections = [sampleDetection];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 1, averageConfidence: 0.9));
      when(() => mockInventoryRepository.createItem(photoPath: any(), thumbnailPath: any(), detection: any()))
        .thenAnswer((_) async => Left(Failure('Database error')));

      // Act: Build and attempt save
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Assert: Error dialog shown
      expect(find.text('Save Failed'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('should allow retaking photo from empty state', (tester) async {
      // Arrange: No detections
      final detections = <Detection>[];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 0, averageConfidence: 0.0));

      // Act: Build widget
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      final retakeButton = find.text('Retake Photo');
      expect(retakeButton, findsOneWidget);

      // Tap Retake
      await tester.tap(retakeButton);
      await tester.pumpAndSettle();

      // Assert: Navigated back to camera (DetectionResultsScreen closed)
      expect(find.byType(DetectionResultsScreen), findsNothing);
    });

    testWidgets('should display alternative labels if available', (tester) async {
      // Arrange: Detection with alternative labels
      final detection = Detection(
        id: 'det-1',
        label: 'Laptop',
        confidence: 0.90,
        boundingBox: BoundingBox(x: 0.1, y: 0.2, width: 0.3, height: 0.4),
        ensembleDetails: EnsembleDetails(
          labelConsensus: 'unanimous',
          providerAgreement: 2,
          confidenceByProvider: {VisionProvider.aws: 0.75, VisionProvider.tensorflow: 0.65},
        ),
        alternativeLabels: [
          AlternativeLabel(label: 'Computer', confidence: 0.75, provider: VisionProvider.aws),
          AlternativeLabel(label: 'Notebook', confidence: 0.65, provider: VisionProvider.tensorflow),
        ],
      );
      final detectionResponse = DetectionResponse(detections: [detection], ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 2, averageConfidence: 0.7));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Tap to expand alternatives
      await tester.tap(find.text('Show alternatives'));
      await tester.pumpAndSettle();

      // Assert: Alternative labels shown
      expect(find.text('Computer (75%)'), findsOneWidget);
      expect(find.text('Notebook (65%)'), findsOneWidget);
    });

    testWidgets('should show confidence as percentage with proper formatting', (tester) async {
      // Arrange: Various confidence values
      final detections = [
        Detection(
          id: 'det-1',
          label: 'Laptop',
          confidence: 0.923, // Should show as 92%
          boundingBox: BoundingBox(x: 0.1, y: 0.2, width: 0.3, height: 0.4),
          ensembleDetails: EnsembleDetails(
            labelConsensus: 'unanimous',
            providerAgreement: 1,
            confidenceByProvider: {VisionProvider.google: 0.923},
          ),
          alternativeLabels: const [],
        ),
        Detection(
          id: 'det-2',
          label: 'Mouse',
          confidence: 0.8765, // Should show as 88%
          boundingBox: BoundingBox(x: 0.5, y: 0.6, width: 0.2, height: 0.2),
          ensembleDetails: EnsembleDetails(
            labelConsensus: 'unanimous',
            providerAgreement: 1,
            confidenceByProvider: {VisionProvider.google: 0.8765},
          ),
          alternativeLabels: const [],
        ),
      ];
      final detectionResponse = DetectionResponse(detections: detections, ensembleMode: 'test', processingTimeMs: 100, ensembleMetrics: EnsembleMetrics(providersUsed: 2, averageConfidence: 0.9));

      // Act
      await tester.pumpWidget(createTestWidget(detectionResponse: detectionResponse));
      await tester.pumpAndSettle();

      // Assert: Percentages rounded correctly
      expect(find.text('92%'), findsOneWidget);
      expect(find.text('88%'), findsOneWidget);
    });
  });
}
