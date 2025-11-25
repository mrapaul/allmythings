import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'dart:io';

class MockApiClient extends Mock implements ApiClient {}

void main() {
  group('DetectionRepository Functional Tests', () {
    late DetectionRepository repository;
    late MockApiClient mockApiClient;

    setUp(() {
      mockApiClient = MockApiClient();
      repository = DetectionRepository(apiClient: mockApiClient);
    });

    group('detectFromFile', () {
      test('successfully detects objects from image file', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        final expectedDetections = [
          Detection(object: 'couch', confidence: 0.95),
          Detection(object: 'table', confidence: 0.88),
        ];

        when(mockApiClient.detectObjects(any))
            .thenAnswer((_) async => expectedDetections);

        // Act
        final result = await repository.detectFromFile(testImageFile);

        // Assert
        expect(result, equals(expectedDetections));
        expect(result.length, equals(2));
        verify(mockApiClient.detectObjects(testImageFile)).called(1);
      });

      test('handles empty detection results', () async {
        // Arrange
        final testImageFile = File('test_assets/blank_image.jpg');
        when(mockApiClient.detectObjects(any)).thenAnswer((_) async => []);

        // Act
        final result = await repository.detectFromFile(testImageFile);

        // Assert
        expect(result, isEmpty);
      });

      test('propagates API errors', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        when(mockApiClient.detectObjects(any))
            .thenThrow(Exception('API Error'));

        // Act & Assert
        expect(
          () => repository.detectFromFile(testImageFile),
          throwsException,
        );
      });

      test('handles network timeout gracefully', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        when(mockApiClient.detectObjects(any))
            .thenThrow(SocketException('Connection timeout'));

        // Act & Assert
        expect(
          () => repository.detectFromFile(testImageFile),
          throwsA(isA<SocketException>()),
        );
      });
    });

    group('detectFromBytes', () {
      test('successfully detects from image bytes', () async {
        // Arrange
        final imageBytes = [0xFF, 0xD8, 0xFF]; // JPEG header
        final expectedDetections = [
          Detection(object: 'bed', confidence: 0.92),
          Detection(object: 'pillow', confidence: 0.87),
        ];

        when(mockApiClient.detectFromBytes(any))
            .thenAnswer((_) async => expectedDetections);

        // Act
        final result = await repository.detectFromBytes(
          Uint8List.fromList(imageBytes),
        );

        // Assert
        expect(result, equals(expectedDetections));
        expect(result.length, equals(2));
      });

      test('handles large image bytes', () async {
        // Arrange - Create large dummy image data
        final largeImageBytes = Uint8List(10 * 1024 * 1024); // 10MB
        final expectedDetections = [
          Detection(object: 'item1', confidence: 0.85),
        ];

        when(mockApiClient.detectFromBytes(any))
            .thenAnswer((_) async => expectedDetections);

        // Act
        final result = await repository.detectFromBytes(largeImageBytes);

        // Assert
        expect(result, isNotEmpty);
      });
    });

    group('Result Transformation', () {
      test('correctly transforms API response to domain models', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        final apiResponse = [
          Detection(object: 'chair', confidence: 0.91),
        ];

        when(mockApiClient.detectObjects(any))
            .thenAnswer((_) async => apiResponse);

        // Act
        final result = await repository.detectFromFile(testImageFile);

        // Assert
        expect(result[0].object, equals('chair'));
        expect(result[0].confidence, equals(0.91));
      });

      test('preserves confidence precision', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        final preciseConfidence = 0.8734567;
        final detections = [
          Detection(object: 'item', confidence: preciseConfidence),
        ];

        when(mockApiClient.detectObjects(any))
            .thenAnswer((_) async => detections);

        // Act
        final result = await repository.detectFromFile(testImageFile);

        // Assert
        expect(result[0].confidence, equals(preciseConfidence));
      });
    });

    group('Error Handling', () {
      test('handles invalid file path', () async {
        // Arrange
        final invalidFile = File('/invalid/path/image.jpg');
        when(mockApiClient.detectObjects(any))
            .thenThrow(Exception('File not found'));

        // Act & Assert
        expect(
          () => repository.detectFromFile(invalidFile),
          throwsException,
        );
      });

      test('handles API server errors', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        when(mockApiClient.detectObjects(any))
            .thenThrow(Exception('500 Server Error'));

        // Act & Assert
        expect(
          () => repository.detectFromFile(testImageFile),
          throwsException,
        );
      });

      test('handles malformed response data', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        when(mockApiClient.detectObjects(any))
            .thenThrow(Exception('Invalid response format'));

        // Act & Assert
        expect(
          () => repository.detectFromFile(testImageFile),
          throwsException,
        );
      });
    });

    group('Concurrent Operations', () {
      test('handles multiple concurrent requests', () async {
        // Arrange
        final file1 = File('test_assets/image1.jpg');
        final file2 = File('test_assets/image2.jpg');
        final detections1 = [Detection(object: 'item1', confidence: 0.9)];
        final detections2 = [Detection(object: 'item2', confidence: 0.85)];

        when(mockApiClient.detectObjects(file1))
            .thenAnswer((_) async => detections1);
        when(mockApiClient.detectObjects(file2))
            .thenAnswer((_) async => detections2);

        // Act
        final results = await Future.wait([
          repository.detectFromFile(file1),
          repository.detectFromFile(file2),
        ]);

        // Assert
        expect(results[0], equals(detections1));
        expect(results[1], equals(detections2));
        expect(results.length, equals(2));
      });
    });

    group('Performance', () {
      test('completes detection within timeout', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        when(mockApiClient.detectObjects(any))
            .thenAnswer((_) async => [Detection(object: 'item', confidence: 0.9)]);

        // Act & Assert
        final result = await repository.detectFromFile(testImageFile)
            .timeout(const Duration(seconds: 10));
        expect(result, isNotEmpty);
      });

      test('handles rapid successive calls', () async {
        // Arrange
        final testImageFile = File('test_assets/test_image.jpg');
        final detections = [Detection(object: 'item', confidence: 0.9)];
        when(mockApiClient.detectObjects(any))
            .thenAnswer((_) async => detections);

        // Act
        for (int i = 0; i < 5; i++) {
          final result = await repository.detectFromFile(testImageFile);
          expect(result, equals(detections));
        }

        // Assert
        verify(mockApiClient.detectObjects(testImageFile)).called(5);
      });
    });
  });
}
