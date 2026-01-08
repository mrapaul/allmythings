import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/core/errors/failures.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/ensemble_metrics.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:all_my_things/presentation/detection/detection_results_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fpdart/fpdart.dart';
import 'package:mockito/mockito.dart';

// Mock repository
class MockDetectionRepository extends Mock implements DetectionRepository {}

// Test data
const testBoundingBox = BoundingBox(x: 0.1, y: 0.1, width: 0.5, height: 0.5);
const testEnsembleDetails = EnsembleDetails(
  providersUsed: 2,
  providerAgreement: 2,
  labelConsensus: 'test',
  confidenceByProvider: {
    VisionProvider.google: 0.9,
    VisionProvider.aws: 0.85,
  },
);

const testDetection = Detection(
  id: '1',
  label: 'test',
  confidence: 0.9,
  boundingBox: testBoundingBox,
  ensembleDetails: testEnsembleDetails,
  alternativeLabels: [
    AlternativeLabel(
      label: 'alternative',
      confidence: 0.8,
      provider: VisionProvider.google,
    ),
  ],
);

final testDetectionResponse = DetectionResponse(
  detections: [testDetection],
  ensembleMetrics: EnsembleMetrics(
    averageConfidence: 0.9,
    totalDetections: 1,
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockDetectionRepository mockDetectionRepository;
  late ProviderContainer container;

  setUp(() {
    mockDetectionRepository = MockDetectionRepository();

    // Setup ProviderContainer for testing
    container = ProviderContainer(
      overrides: [
        detectionRepositoryProvider.overrideWithValue(mockDetectionRepository),
      ],
    );
  });

  testWidgets('should show loading state initially', (tester) async {
    when(
      mockDetectionRepository.detectObjects(any, any),
    ).thenAnswer((_) async => Right(testDetectionResponse));

    await tester.pumpWidget(
      ProviderScope(
        parent: container,
        child: const MaterialApp(
          home: DetectionResultsScreen(
            imagePath: 'test_images/test.jpg',
          ),
        ),
      ),
    );

    // Verify loading indicator is shown
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('should show error state when detection fails', (tester) async {
    when(
      mockDetectionRepository.detectObjects(any, any),
    ).thenAnswer((_) async => Left(ServerFailure('Failed to detect objects')));

    await tester.pumpWidget(
      ProviderScope(
        parent: container,
        child: const MaterialApp(
          home: DetectionResultsScreen(
            imagePath: 'test_images/test.jpg',
          ),
        ),
      ),
    );

    // Wait for the future to complete
    await tester.pumpAndSettle();

    // Verify error message is shown
    expect(find.text('Failed to detect objects'), findsOneWidget);
  });

  testWidgets('should show detection results when successful', (tester) async {
    when(
      mockDetectionRepository.detectObjects(any, any),
    ).thenAnswer((_) async => Right(testDetectionResponse));

    await tester.pumpWidget(
      ProviderScope(
        parent: container,
        child: const MaterialApp(
          home: DetectionResultsScreen(
            imagePath: 'test_images/test.jpg',
          ),
        ),
      ),
    );

    // Wait for the future to complete
    await tester.pumpAndSettle();

    // Verify detection results are shown
    expect(find.text('test'), findsOneWidget);
    expect(find.text('90%'), findsOneWidget);
  });
}
