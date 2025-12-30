import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

/// Service for storing images in app's local storage
/// Images are persisted even if original photos are deleted from device
class ImageStorageService {
  static const String _imagesFolder = 'inventory_images';
  static const String _originalsFolder = 'originals';
  static const String _thumbnailsFolder = 'thumbnails';

  static final _uuid = Uuid();

  /// Get the app's images directory
  static Future<Directory> _getImagesDir() async {
    final appDir = await getApplicationDocumentsDirectory();
    final imagesDir = Directory(path.join(appDir.path, _imagesFolder));
    if (!await imagesDir.exists()) {
      await imagesDir.create(recursive: true);
    }
    return imagesDir;
  }

  /// Get the originals subdirectory
  static Future<Directory> _getOriginalsDir() async {
    final imagesDir = await _getImagesDir();
    final originalsDir = Directory(path.join(imagesDir.path, _originalsFolder));
    if (!await originalsDir.exists()) {
      await originalsDir.create(recursive: true);
    }
    return originalsDir;
  }

  /// Get the thumbnails subdirectory
  static Future<Directory> _getThumbnailsDir() async {
    final imagesDir = await _getImagesDir();
    final thumbnailsDir = Directory(path.join(imagesDir.path, _thumbnailsFolder));
    if (!await thumbnailsDir.exists()) {
      await thumbnailsDir.create(recursive: true);
    }
    return thumbnailsDir;
  }

  /// Generate a unique filename for an image
  static String _generateFilename(String extension) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final uniqueId = _uuid.v4().substring(0, 8);
    return '${timestamp}_$uniqueId$extension';
  }

  /// Copy original image to app storage
  /// Returns the new path in app storage
  static Future<String> saveOriginalImage(File sourceFile) async {
    try {
      final originalsDir = await _getOriginalsDir();
      final extension = path.extension(sourceFile.path).toLowerCase();
      final filename = _generateFilename(extension.isEmpty ? '.jpg' : extension);
      final destPath = path.join(originalsDir.path, filename);

      // Copy file to app storage
      await sourceFile.copy(destPath);

      debugPrint('Saved original image: $destPath');
      return destPath;
    } catch (e) {
      debugPrint('Error saving original image: $e');
      rethrow;
    }
  }

  /// Save thumbnail bytes to app storage
  /// Returns the new path in app storage
  static Future<String> saveThumbnail(Uint8List bytes, {String extension = '.png'}) async {
    try {
      final thumbnailsDir = await _getThumbnailsDir();
      final filename = _generateFilename(extension);
      final destPath = path.join(thumbnailsDir.path, filename);

      // Write bytes to file
      final file = File(destPath);
      await file.writeAsBytes(bytes);

      debugPrint('Saved thumbnail: $destPath');
      return destPath;
    } catch (e) {
      debugPrint('Error saving thumbnail: $e');
      rethrow;
    }
  }

  /// Save thumbnail from existing file to app storage
  /// Returns the new path in app storage
  static Future<String> saveThumbnailFromFile(File sourceFile) async {
    try {
      final thumbnailsDir = await _getThumbnailsDir();
      final extension = path.extension(sourceFile.path).toLowerCase();
      final filename = _generateFilename(extension.isEmpty ? '.png' : extension);
      final destPath = path.join(thumbnailsDir.path, filename);

      // Copy file to app storage
      await sourceFile.copy(destPath);

      debugPrint('Saved thumbnail from file: $destPath');
      return destPath;
    } catch (e) {
      debugPrint('Error saving thumbnail from file: $e');
      rethrow;
    }
  }

  /// Create and save an image with bounding box overlay
  /// Returns the new path in app storage
  static Future<String> saveBoundedImage({
    required File sourceFile,
    required double bboxX,
    required double bboxY,
    required double bboxWidth,
    required double bboxHeight,
    int boxColor = 0xFF0095F6, // Instagram blue
  }) async {
    try {
      final originalsDir = await _getOriginalsDir();
      final filename = _generateFilename('.png');
      final destPath = path.join(originalsDir.path, 'bounded_$filename');

      // Load and decode the image
      final bytes = await sourceFile.readAsBytes();
      final sourceImage = img.decodeImage(bytes);
      if (sourceImage == null) {
        throw Exception('Failed to decode source image');
      }

      // Calculate pixel coordinates
      final x = (bboxX * sourceImage.width).round();
      final y = (bboxY * sourceImage.height).round();
      final w = (bboxWidth * sourceImage.width).round();
      final h = (bboxHeight * sourceImage.height).round();

      // Draw bounding box
      final boxColorObj = img.ColorRgba8(
        (boxColor >> 16) & 0xFF, // R
        (boxColor >> 8) & 0xFF,  // G
        boxColor & 0xFF,          // B
        255,                      // A
      );

      // Draw rectangle (4 lines)
      final strokeWidth = 4;

      // Top line
      img.drawLine(sourceImage, x1: x, y1: y, x2: x + w, y2: y, color: boxColorObj, thickness: strokeWidth);
      // Bottom line
      img.drawLine(sourceImage, x1: x, y1: y + h, x2: x + w, y2: y + h, color: boxColorObj, thickness: strokeWidth);
      // Left line
      img.drawLine(sourceImage, x1: x, y1: y, x2: x, y2: y + h, color: boxColorObj, thickness: strokeWidth);
      // Right line
      img.drawLine(sourceImage, x1: x + w, y1: y, x2: x + w, y2: y + h, color: boxColorObj, thickness: strokeWidth);

      // Draw corner accents (thicker)
      final cornerLength = 20;
      final cornerWidth = 6;

      // Top-left corner
      img.drawLine(sourceImage, x1: x, y1: y, x2: x + cornerLength, y2: y, color: boxColorObj, thickness: cornerWidth);
      img.drawLine(sourceImage, x1: x, y1: y, x2: x, y2: y + cornerLength, color: boxColorObj, thickness: cornerWidth);

      // Top-right corner
      img.drawLine(sourceImage, x1: x + w - cornerLength, y1: y, x2: x + w, y2: y, color: boxColorObj, thickness: cornerWidth);
      img.drawLine(sourceImage, x1: x + w, y1: y, x2: x + w, y2: y + cornerLength, color: boxColorObj, thickness: cornerWidth);

      // Bottom-left corner
      img.drawLine(sourceImage, x1: x, y1: y + h - cornerLength, x2: x, y2: y + h, color: boxColorObj, thickness: cornerWidth);
      img.drawLine(sourceImage, x1: x, y1: y + h, x2: x + cornerLength, y2: y + h, color: boxColorObj, thickness: cornerWidth);

      // Bottom-right corner
      img.drawLine(sourceImage, x1: x + w, y1: y + h - cornerLength, x2: x + w, y2: y + h, color: boxColorObj, thickness: cornerWidth);
      img.drawLine(sourceImage, x1: x + w - cornerLength, y1: y + h, x2: x + w, y2: y + h, color: boxColorObj, thickness: cornerWidth);

      // Encode and save
      final pngBytes = img.encodePng(sourceImage);
      await File(destPath).writeAsBytes(pngBytes);

      debugPrint('Saved bounded image: $destPath');
      return destPath;
    } catch (e) {
      debugPrint('Error saving bounded image: $e');
      rethrow;
    }
  }

  /// Create and save a cropped image from bounding box
  /// Returns the new path in app storage
  static Future<String> saveCroppedImage({
    required File sourceFile,
    required double bboxX,
    required double bboxY,
    required double bboxWidth,
    required double bboxHeight,
  }) async {
    try {
      final thumbnailsDir = await _getThumbnailsDir();
      final filename = _generateFilename('.png');
      final destPath = path.join(thumbnailsDir.path, 'crop_$filename');

      // Load and decode the image
      final bytes = await sourceFile.readAsBytes();
      final sourceImage = img.decodeImage(bytes);
      if (sourceImage == null) {
        throw Exception('Failed to decode source image');
      }

      // Calculate pixel coordinates
      final x = (bboxX * sourceImage.width).round().clamp(0, sourceImage.width - 1);
      final y = (bboxY * sourceImage.height).round().clamp(0, sourceImage.height - 1);
      final w = (bboxWidth * sourceImage.width).round().clamp(1, sourceImage.width - x);
      final h = (bboxHeight * sourceImage.height).round().clamp(1, sourceImage.height - y);

      // Crop the image
      final cropped = img.copyCrop(sourceImage, x: x, y: y, width: w, height: h);

      // Encode and save
      final pngBytes = img.encodePng(cropped);
      await File(destPath).writeAsBytes(pngBytes);

      debugPrint('Saved cropped image: $destPath');
      return destPath;
    } catch (e) {
      debugPrint('Error saving cropped image: $e');
      rethrow;
    }
  }

  /// Delete an image from app storage
  static Future<void> deleteImage(String imagePath) async {
    try {
      final file = File(imagePath);
      if (await file.exists()) {
        await file.delete();
        debugPrint('Deleted image: $imagePath');
      }
    } catch (e) {
      debugPrint('Error deleting image: $e');
    }
  }

  /// Delete both original and thumbnail for an item
  static Future<void> deleteItemImages({
    required String? originalPath,
    required String? thumbnailPath,
  }) async {
    if (originalPath != null) {
      await deleteImage(originalPath);
    }
    if (thumbnailPath != null) {
      await deleteImage(thumbnailPath);
    }
  }

  /// Check if image exists
  static Future<bool> imageExists(String imagePath) async {
    return File(imagePath).exists();
  }

  /// Get storage statistics
  static Future<StorageStats> getStorageStats() async {
    try {
      final imagesDir = await _getImagesDir();
      var totalSize = 0;
      var imageCount = 0;

      await for (final entity in imagesDir.list(recursive: true)) {
        if (entity is File) {
          final stat = await entity.stat();
          totalSize += stat.size;
          imageCount++;
        }
      }

      return StorageStats(
        totalSizeBytes: totalSize,
        imageCount: imageCount,
        storagePath: imagesDir.path,
      );
    } catch (e) {
      debugPrint('Error getting storage stats: $e');
      return StorageStats(totalSizeBytes: 0, imageCount: 0, storagePath: '');
    }
  }

  /// Clear all stored images (for testing/debugging)
  static Future<void> clearAllImages() async {
    try {
      final imagesDir = await _getImagesDir();
      if (await imagesDir.exists()) {
        await imagesDir.delete(recursive: true);
        debugPrint('Cleared all stored images');
      }
    } catch (e) {
      debugPrint('Error clearing images: $e');
    }
  }
}

/// Storage statistics
class StorageStats {
  StorageStats({
    required this.totalSizeBytes,
    required this.imageCount,
    required this.storagePath,
  });

  final int totalSizeBytes;
  final int imageCount;
  final String storagePath;

  String get totalSizeMB => (totalSizeBytes / (1024 * 1024)).toStringAsFixed(2);
}
