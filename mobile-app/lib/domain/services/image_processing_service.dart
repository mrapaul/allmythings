import 'dart:io';

import 'package:all_my_things/core/config/app_config.dart';
import 'package:all_my_things/core/errors/failures.dart';
import 'package:fpdart/fpdart.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;

/// Service for image processing (thumbnails, compression)
class ImageProcessingService {
  /// Generate thumbnail from image
  Future<Either<Failure, File>> generateThumbnail(File imageFile) async {
    try {
      // Read image
      final bytes = await imageFile.readAsBytes();
      final image = img.decodeImage(bytes);

      if (image == null) {
        return left(
          const Failure.storage(message: 'Failed to decode image'),
        );
      }

      // Resize to thumbnail
      final thumbnail = img.copyResize(
        image,
        width: AppConfig.thumbnailSize,
        height: AppConfig.thumbnailSize,
        interpolation: img.Interpolation.average,
      );

      // Save thumbnail
      final directory = p.dirname(imageFile.path);
      final filename = p.basenameWithoutExtension(imageFile.path);
      final thumbnailPath = p.join(directory, '${filename}_thumb.jpg');

      final thumbnailBytes = img.encodeJpg(
        thumbnail,
        quality: AppConfig.imageQuality,
      );

      final thumbnailFile = File(thumbnailPath);
      await thumbnailFile.writeAsBytes(thumbnailBytes);

      return right(thumbnailFile);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to generate thumbnail: $e'),
      );
    }
  }
}
