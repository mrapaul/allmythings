import 'dart:io';
import 'package:image/image.dart' as img;
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/core/config/app_config.dart';

/// Service for image processing, including thumbnail generation and cropping
class ImageProcessingService {
  /// Generate a thumbnail from a photo, cropped to a specific bounding box
  /// The bounding box coordinates are normalized (0.0 - 1.0)
  Future<File> generateThumbnail(File photo, BoundingBox box) async {
    final bytes = await photo.readAsBytes();
    final image = img.decodeImage(bytes);
    if (image == null) throw Exception('Could not decode image');

    // Box is normalized 0.0 - 1.0
    // Ensure values are within bounds
    final x = (box.x * image.width).toInt().clamp(0, image.width - 1);
    final y = (box.y * image.height).toInt().clamp(0, image.height - 1);
    final w = (box.width * image.width).toInt().clamp(1, image.width - x);
    final h = (box.height * image.height).toInt().clamp(1, image.height - y);

    final cropped = img.copyCrop(image, x: x, y: y, width: w, height: h);
    
    final targetSize = AppConfig.thumbnailSize;
    
    // Resize maintaining aspect ratio
    final resized = img.copyResize(
      cropped,
      width: targetSize,
      interpolation: img.Interpolation.linear,
    );

    // Create thumbnail path with timestamp to avoid name collisions
    final thumbnailPath = photo.path.replaceAll(
      '.jpg', 
      '_thumb_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
    
    final thumbnailFile = File(thumbnailPath);
    await thumbnailFile.writeAsBytes(img.encodeJpg(resized, quality: AppConfig.imageQuality));
    
    return thumbnailFile;
  }
}
