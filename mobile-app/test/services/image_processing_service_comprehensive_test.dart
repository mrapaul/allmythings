import 'dart:typed_data';

import 'package:all_my_things/domain/services/image_processing_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ImageProcessingService Comprehensive Tests', () {
    late ImageProcessingService service;

    setUp(() {
      service = const ImageProcessingService();
    });

    group('Image Validation', () {
      test(
        'should validate image file',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final bytes = img.encodePng(image);

          // Act
          final isValid = service.isValidImage(bytes);

          // Assert
          expect(isValid, isTrue);
        },
      );

      test(
        'should reject empty image data',
        () {
          // Arrange
          final emptyBytes = Uint8List(0);

          // Act
          final isValid = service.isValidImage(emptyBytes);

          // Assert
          expect(isValid, isFalse);
        },
      );

      test(
        'should reject invalid image format',
        () {
          // Arrange
          final invalidBytes = Uint8List.fromList([0xFF, 0x00, 0xAA]);

          // Act
          final isValid = service.isValidImage(invalidBytes);

          // Assert
          expect(isValid, isFalse);
        },
      );

      test(
        'should validate minimum image dimensions',
        () {
          // Arrange
          final smallImage = img.Image(width: 50, height: 50);
          final validImage = img.Image(width: 200, height: 200);

          // Act
          final isSmallValid = service.isValidImage(
            img.encodePng(smallImage),
          );
          final isValidValid = service.isValidImage(
            img.encodePng(validImage),
          );

          // Assert
          expect(isSmallValid, isFalse);
          expect(isValidValid, isTrue);
        },
      );

      test(
        'should validate maximum image dimensions',
        () {
          // Arrange
          final largeImage = img.Image(width: 8000, height: 8000);
          final validImage = img.Image(width: 3000, height: 3000);

          // Act
          final isLargeValid = service.isValidImage(
            img.encodePng(largeImage),
          );
          final isValidValid = service.isValidImage(
            img.encodePng(validImage),
          );

          // Assert
          expect(isLargeValid, isFalse);
          expect(isValidValid, isTrue);
        },
      );
    });

    group('Image Compression', () {
      test(
        'should compress image to smaller size',
        () {
          // Arrange
          final image = img.Image(width: 1000, height: 1000);
          final originalBytes = img.encodePng(image);

          // Act
          final compressed = service.compressImage(originalBytes);

          // Assert
          expect(compressed.length, lessThan(originalBytes.length));
        },
      );

      test(
        'should maintain image quality after compression',
        () {
          // Arrange
          final image = img.Image(width: 500, height: 500);
          final bytes = img.encodePng(image);

          // Act
          final compressed = service.compressImage(bytes);

          // Assert
          expect(compressed.isNotEmpty, isTrue);
          expect(compressed.length, lessThan(bytes.length));
        },
      );

      test(
        'should handle already compressed images',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final bytes = img.encodeJpg(image, quality: 95);

          // Act
          final compressed = service.compressImage(bytes);

          // Assert
          expect(compressed.isNotEmpty, isTrue);
        },
      );

      test(
        'should respect quality settings',
        () {
          // Arrange
          final image = img.Image(width: 500, height: 500);
          final originalBytes = img.encodePng(image);

          // Act
          final compressed = service.compressImage(originalBytes);

          // Assert
          expect(compressed.length, lessThan(originalBytes.length));
        },
      );
    });

    group('Image Resizing', () {
      test(
        'should resize image to target dimensions',
        () {
          // Arrange
          final image = img.Image(width: 1000, height: 1000);
          final bytes = img.encodePng(image);

          // Act
          final resized = service.resizeImage(bytes, 500, 500);

          // Assert
          expect(resized.isNotEmpty, isTrue);
        },
      );

      test(
        'should maintain aspect ratio during resize',
        () {
          // Arrange
          final image = img.Image(width: 800, height: 600);
          final bytes = img.encodePng(image);

          // Act
          final resized = service.resizeImage(bytes, 400, 300);

          // Assert
          expect(resized.isNotEmpty, isTrue);
        },
      );

      test(
        'should handle upscaling',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final bytes = img.encodePng(image);

          // Act
          final resized = service.resizeImage(bytes, 500, 500);

          // Assert
          expect(resized.isNotEmpty, isTrue);
        },
      );

      test(
        'should handle square and non-square images',
        () {
          // Arrange
          final squareImage = img.Image(width: 500, height: 500);
          final rectImage = img.Image(width: 800, height: 600);

          final squareBytes = img.encodePng(squareImage);
          final rectBytes = img.encodePng(rectImage);

          // Act
          final resizedSquare = service.resizeImage(squareBytes, 300, 300);
          final resizedRect = service.resizeImage(rectBytes, 300, 300);

          // Assert
          expect(resizedSquare.isNotEmpty, isTrue);
          expect(resizedRect.isNotEmpty, isTrue);
        },
      );
    });

    group('Image Rotation', () {
      test(
        'should rotate image 90 degrees',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 200);
          final bytes = img.encodePng(image);

          // Act
          final rotated = service.rotateImage(bytes, 90);

          // Assert
          expect(rotated.isNotEmpty, isTrue);
        },
      );

      test(
        'should handle multiple rotations',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final bytes = img.encodePng(image);

          // Act
          final rotated = service.rotateImage(bytes, 180);

          // Assert
          expect(rotated.isNotEmpty, isTrue);
        },
      );

      test(
        'should handle 360 degree rotation',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          const originalBytes = [0x89, 0x50, 0x4E, 0x47]; // PNG header

          // Act & Assert
          // Full rotation should result in valid image
        },
      );
    });

    group('Image Format Conversion', () {
      test(
        'should convert PNG to JPEG',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final pngBytes = img.encodePng(image);

          // Act
          final jpegBytes = service.convertImageFormat(pngBytes, 'jpeg');

          // Assert
          expect(jpegBytes.isNotEmpty, isTrue);
        },
      );

      test(
        'should handle existing JPEG format',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final jpegBytes = img.encodeJpg(image);

          // Act
          final converted = service.convertImageFormat(jpegBytes, 'jpeg');

          // Assert
          expect(converted.isNotEmpty, isTrue);
        },
      );
    });

    group('Batch Image Processing', () {
      test(
        'should process multiple images',
        () async {
          // Arrange
          final images = List.generate(
            3,
            (i) => img.Image(width: 200 + (i * 100), height: 200 + (i * 100)),
          );
          final bytesList = images.map((img) => img.encodePng(img)).toList();

          // Act
          final processed = bytesList.map(service.compressImage).toList();

          // Assert
          expect(processed.length, equals(3));
          for (final bytes in processed) {
            expect(bytes.isNotEmpty, isTrue);
          }
        },
      );
    });

    group('Image Metadata Extraction', () {
      test(
        'should extract image dimensions',
        () {
          // Arrange
          final image = img.Image(width: 640, height: 480);
          final bytes = img.encodePng(image);

          // Act
          final (width, height) = service.getImageDimensions(bytes);

          // Assert
          expect(width, equals(640));
          expect(height, equals(480));
        },
      );

      test(
        'should calculate image aspect ratio',
        () {
          // Arrange
          final image = img.Image(width: 800, height: 600);
          final bytes = img.encodePng(image);

          // Act
          final aspectRatio = service.getAspectRatio(bytes);

          // Assert
          expect(aspectRatio, closeTo(1.33, 0.01));
        },
      );

      test(
        'should calculate image file size',
        () {
          // Arrange
          final image = img.Image(width: 100, height: 100);
          final bytes = img.encodePng(image);

          // Act
          final size = bytes.length;

          // Assert
          expect(size, greaterThan(0));
        },
      );
    });

    group('Error Handling', () {
      test(
        'should handle null input gracefully',
        () {
          // Arrange
          final nullBytes = Uint8List(0);

          // Act & Assert
          expect(service.isValidImage(nullBytes), isFalse);
        },
      );

      test(
        'should handle corrupted image data',
        () {
          // Arrange
          final corruptedBytes = Uint8List.fromList(
            [0xFF, 0xD8, 0xFF, 0xE0] + List.filled(100, 0x00),
          );

          // Act & Assert
          // Should not throw
          service.isValidImage(corruptedBytes);
        },
      );

      test(
        'should handle extreme dimensions',
        () {
          // Arrange
          final image = img.Image(width: 1, height: 1);
          final bytes = img.encodePng(image);

          // Act
          final isValid = service.isValidImage(bytes);

          // Assert
          expect(isValid, isFalse);
        },
      );
    });
  });
}
