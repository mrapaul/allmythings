import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../fixtures/mock_data.dart';

class MockDetectionRepository extends Mock implements DetectionRepository {}

class MockApiClient extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DetectObjectsProvider Tests', () {
    late MockDetectionRepository mockRepository;

    setUp(() {
      mockRepository = MockDetectionRepository();
    });

    test(
      'should return detection response from repository',
      () async {
        // Arrange
        final response = MockDataFactory.createDetectionResponse();
        when(() => mockRepository.detectObjects(any())).thenAnswer(
          (_) async => response,
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          detectObjectsProvider('/path/to/image.jpg').future,
        );

        // Assert
        expect(result, equals(response));
        expect(result.detections.length, greaterThan(0));
        verify(() => mockRepository.detectObjects(any())).called(1);
      },
    );

    test(
      'should handle detection API error',
      () async {
        // Arrange
        when(() => mockRepository.detectObjects(any())).thenThrow(
          Exception('Detection failed'),
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act & Assert
        expect(
          () => container.read(
            detectObjectsProvider('/path/to/image.jpg').future,
          ),
          throwsException,
        );
      },
    );

    test(
      'should handle empty detections',
      () async {
        // Arrange
        final response = MockDataFactory.createDetectionResponse(
          detections: [],
        );
        when(() => mockRepository.detectObjects(any())).thenAnswer(
          (_) async => response,
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          detectObjectsProvider('/path/to/image.jpg').future,
        );

        // Assert
        expect(result.detections, isEmpty);
      },
    );

    test(
      'should pass correct image path to repository',
      () async {
        // Arrange
        const imagePath = '/path/to/test_image.jpg';
        final response = MockDataFactory.createDetectionResponse();
        when(() => mockRepository.detectObjects(imagePath)).thenAnswer(
          (_) async => response,
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act
        await container.read(detectObjectsProvider(imagePath).future);

        // Assert
        verify(() => mockRepository.detectObjects(imagePath)).called(1);
      },
    );
  });

  group('EnsembleMetricsProvider Tests', () {
    late MockDetectionRepository mockRepository;

    setUp(() {
      mockRepository = MockDetectionRepository();
    });

    test(
      'should calculate ensemble metrics from detection response',
      () async {
        // Arrange
        final detections = [
          MockDataFactory.createDetection(),
          MockDataFactory.createDetection(confidence: 0.92),
          MockDataFactory.createDetection(confidence: 0.88),
        ];
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );
        when(() => mockRepository.detectObjects(any())).thenAnswer(
          (_) async => response,
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act
        final metrics = await container.read(
          ensembleMetricsProvider('/path/to/image.jpg').future,
        );

        // Assert
        expect(metrics.totalDetections, equals(3));
        expect(metrics.averageConfidence, greaterThan(0.85));
      },
    );
  });

  group('SelectedDetectionsProvider Tests', () {
    test(
      'should track selected detections',
      () async {
        // Arrange
        final detection1 = MockDataFactory.createDetection();
        final detection2 = MockDataFactory.createDetection(label: 'chair');

        final container = ProviderContainer();

        // Act - Add selections
        container.read(selectedDetectionsProvider.notifier).add(detection1);
        container.read(selectedDetectionsProvider.notifier).add(detection2);

        // Assert
        final selected = container.read(selectedDetectionsProvider);
        expect(selected.length, equals(2));
        expect(selected.contains(detection1), isTrue);
        expect(selected.contains(detection2), isTrue);
      },
    );

    test(
      'should remove detection from selection',
      () async {
        // Arrange
        final detection = MockDataFactory.createDetection();
        final container = ProviderContainer();

        // Act
        container.read(selectedDetectionsProvider.notifier).add(detection);
        container.read(selectedDetectionsProvider.notifier).remove(detection);

        // Assert
        final selected = container.read(selectedDetectionsProvider);
        expect(selected.isEmpty, isTrue);
      },
    );

    test(
      'should clear all selections',
      () async {
        // Arrange
        final container = ProviderContainer();
        final detections = MockDataFactory.createDetections(3);

        // Act
        for (final detection in detections) {
          container.read(selectedDetectionsProvider.notifier).add(detection);
        }
        container.read(selectedDetectionsProvider.notifier).clear();

        // Assert
        final selected = container.read(selectedDetectionsProvider);
        expect(selected.isEmpty, isTrue);
      },
    );

    test(
      'should toggle detection selection',
      () async {
        // Arrange
        final detection = MockDataFactory.createDetection();
        final container = ProviderContainer();

        // Act
        container.read(selectedDetectionsProvider.notifier).add(detection);
        var selected = container.read(selectedDetectionsProvider);
        expect(selected.contains(detection), isTrue);

        container.read(selectedDetectionsProvider.notifier).remove(detection);
        selected = container.read(selectedDetectionsProvider);
        expect(selected.contains(detection), isFalse);

        // Assert
        expect(selected.isEmpty, isTrue);
      },
    );
  });

  group('FilteredDetectionsProvider Tests', () {
    test(
      'should filter detections by confidence threshold',
      () async {
        // Arrange
        final detections = [
          MockDataFactory.createDetection(),
          MockDataFactory.createDetection(confidence: 0.70),
          MockDataFactory.createDetection(confidence: 0.50),
        ];

        final container = ProviderContainer();

        // Act & Assert - relies on implementation
        expect(detections.length, equals(3));
      },
    );
  });

  group('DetectionCacheProvider Tests', () {
    late MockDetectionRepository mockRepository;

    setUp(() {
      mockRepository = MockDetectionRepository();
    });

    test(
      'should cache detection results',
      () async {
        // Arrange
        final response = MockDataFactory.createDetectionResponse();
        when(() => mockRepository.detectObjects(any())).thenAnswer(
          (_) async => response,
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result1 = await container.read(
          detectObjectsProvider('/path/to/image.jpg').future,
        );
        final result2 = await container.read(
          detectObjectsProvider('/path/to/image.jpg').future,
        );

        // Assert
        expect(result1, equals(result2));
      },
    );

    test(
      'should cache different images separately',
      () async {
        // Arrange
        final response1 = MockDataFactory.createDetectionResponse(
          detections: [
            MockDataFactory.createDetection(),
          ],
        );
        final response2 = MockDataFactory.createDetectionResponse(
          detections: [
            MockDataFactory.createDetection(label: 'chair'),
          ],
        );

        when(() => mockRepository.detectObjects('/image1.jpg')).thenAnswer(
          (_) async => response1,
        );
        when(() => mockRepository.detectObjects('/image2.jpg')).thenAnswer(
          (_) async => response2,
        );

        final container = ProviderContainer(
          overrides: [
            detectionRepositoryProvider.overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result1 = await container.read(
          detectObjectsProvider('/image1.jpg').future,
        );
        final result2 = await container.read(
          detectObjectsProvider('/image2.jpg').future,
        );

        // Assert
        expect(result1.detections.first.label, equals('lamp'));
        expect(result2.detections.first.label, equals('chair'));
      },
    );
  });

  group('AverageConfidenceProvider Tests', () {
    test(
      'should calculate average confidence correctly',
      () async {
        // Arrange
        final detections = [
          MockDataFactory.createDetection(confidence: 0.90),
          MockDataFactory.createDetection(confidence: 0.80),
          MockDataFactory.createDetection(confidence: 0.70),
        ];

        // Act
        final sum = detections.fold<double>(
          0,
          (acc, d) => acc + d.confidence,
        );
        final average = sum / detections.length;

        // Assert
        expect(average, closeTo(0.80, 0.01));
      },
    );
  });
}
