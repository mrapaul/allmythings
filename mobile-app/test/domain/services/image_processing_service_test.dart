import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fpdart/fpdart.dart';
import 'package:home_inventory/core/config/app_config.dart';
import 'package:home_inventory/core/errors/failures.dart';
import 'package:home_inventory/domain/services/image_processing_service.dart';
import 'package:image/image.dart' as img;
import 'package:mockito/mockito.dart';
import 'package:path/path.dart' as p;

// Mock classes
class MockFile extends Mock implements File {}

class MockImage extends Mock implements img.Image {}

class MockAppConfig extends Mock implements AppConfig {}

void main() {
  group('ImageProcessingService', () {
    late ImageProcessingService service;
    late MockFile mockImageFile;

    setUp(() {
      service = ImageProcessingService();
      mockImageFile = MockFile();

      // Mock AppConfig values
      AppConfig.thumbnailSize = 120;
      AppConfig.imageQuality = 80;
    });

    test('generateThumbnail returns a thumbnail file on success', () async {
      final originalBytes = img.encodeJpg(img.Image(width: 200, height: 200));
      final thumbnailBytes = img.encodeJpg(img.Image(width: 120, height: 120));

      when(mockImageFile.readAsBytes()).thenAnswer((_) async => originalBytes);
      when(mockImageFile.path).thenReturn('/test/path/image.jpg');

      final mockThumbnailFile = MockFile();
      when(
        mockThumbnailFile.writeAsBytes(any),
      ).thenAnswer((_) async => mockThumbnailFile);
      when(mockThumbnailFile.path).thenReturn('/test/path/image_thumb.jpg');

      // Mock the global File constructor
      // This is tricky with dart:io. For simplicity, we'll assume File() works as expected
      // and focus on the service's logic given valid File operations.
      // In a real scenario, you might use a package like `file` to mock File system operations.

      // For now, we'll just ensure the logic flows correctly.
      // We can't directly mock `img.decodeImage` or `img.copyResize` as they are static/top-level functions.
      // We'll rely on the fact that if `img.decodeImage` returns null, it's handled.

      final result = await service.generateThumbnail(mockImageFile);

      expect(result.isRight(), true);
      result.fold(
        (l) => fail('Should not have failed'),
        (r) => expect(r.path, '/test/path/image_thumb.jpg'),
      );
      verify(mockImageFile.readAsBytes()).called(1);
    });

    test(
      'generateThumbnail returns Failure when image decoding fails',
      () async {
        when(
          mockImageFile.readAsBytes(),
        ).thenAnswer((_) async => []); // Empty bytes to simulate decode failure
        when(mockImageFile.path).thenReturn('/test/path/image.jpg');

        final result = await service.generateThumbnail(mockImageFile);

        expect(result.isLeft(), true);
        result.fold(
          (l) => expect(
            l,
            const Failure.storage(message: 'Failed to decode image'),
          ),
          (r) => fail('Should have failed'),
        );
        verify(mockImageFile.readAsBytes()).called(1);
      },
    );

    // Note: Mocking `File().writeAsBytes` directly is hard without `file` package.
    // The current test setup focuses on the service's logic given successful/failed internal operations.
  });
}
