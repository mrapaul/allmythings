import 'dart:io';
import 'package:image/image.dart' as img;

/// Service for computing perceptual image hashes
/// Used to identify similar/duplicate items across different photos
class ImageHashService {
  /// Compute a simple average hash (aHash) for an image
  /// Returns a 64-bit hash as a hex string
  static Future<String?> computeHash(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final image = img.decodeImage(bytes);
      if (image == null) return null;

      // Resize to 8x8 and convert to grayscale
      final resized = img.copyResize(image, width: 8, height: 8);
      final grayscale = img.grayscale(resized);

      // Calculate average pixel value
      var sum = 0;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          final pixel = grayscale.getPixel(x, y);
          sum += img.getLuminance(pixel).toInt();
        }
      }
      final avg = sum ~/ 64;

      // Build hash: 1 if pixel > avg, 0 otherwise
      var hash = BigInt.zero;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          final pixel = grayscale.getPixel(x, y);
          final lum = img.getLuminance(pixel).toInt();
          if (lum > avg) {
            hash = hash | (BigInt.one << (y * 8 + x));
          }
        }
      }

      return hash.toRadixString(16).padLeft(16, '0');
    } catch (e) {
      return null;
    }
  }

  /// Compute difference hash (dHash) - more robust than aHash
  /// Compares adjacent pixels for change detection
  static Future<String?> computeDHash(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final image = img.decodeImage(bytes);
      if (image == null) return null;

      // Resize to 9x8 (9 wide to compare 8 pairs)
      final resized = img.copyResize(image, width: 9, height: 8);
      final grayscale = img.grayscale(resized);

      // Build hash: 1 if left pixel > right pixel
      var hash = BigInt.zero;
      var bit = 0;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          final left = img.getLuminance(grayscale.getPixel(x, y)).toInt();
          final right = img.getLuminance(grayscale.getPixel(x + 1, y)).toInt();
          if (left > right) {
            hash = hash | (BigInt.one << bit);
          }
          bit++;
        }
      }

      return hash.toRadixString(16).padLeft(16, '0');
    } catch (e) {
      return null;
    }
  }

  /// Compute perceptual hash from cropped region
  static Future<String?> computeHashFromRegion(
    File imageFile, {
    required double x,
    required double y,
    required double width,
    required double height,
  }) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final image = img.decodeImage(bytes);
      if (image == null) return null;

      // Calculate pixel coordinates
      final px = (x * image.width).round();
      final py = (y * image.height).round();
      final pw = (width * image.width).round();
      final ph = (height * image.height).round();

      // Crop the region
      final cropped = img.copyCrop(
        image,
        x: px.clamp(0, image.width - 1),
        y: py.clamp(0, image.height - 1),
        width: pw.clamp(1, image.width - px),
        height: ph.clamp(1, image.height - py),
      );

      // Save temporarily and compute hash
      final croppedBytes = img.encodeJpg(cropped);
      final tempFile = File('${Directory.systemTemp.path}/temp_hash_${DateTime.now().millisecondsSinceEpoch}.jpg');
      await tempFile.writeAsBytes(croppedBytes);

      final hash = await computeDHash(tempFile);
      await tempFile.delete();

      return hash;
    } catch (e) {
      return null;
    }
  }

  /// Calculate Hamming distance between two hashes
  /// Lower distance = more similar images
  static int hammingDistance(String hash1, String hash2) {
    if (hash1.length != hash2.length) return 64; // Max distance

    final h1 = BigInt.parse(hash1, radix: 16);
    final h2 = BigInt.parse(hash2, radix: 16);
    final xor = h1 ^ h2;

    // Count set bits
    var count = 0;
    var n = xor;
    while (n > BigInt.zero) {
      count += (n & BigInt.one).toInt();
      n = n >> 1;
    }
    return count;
  }

  /// Check if two images are similar based on hash distance
  /// threshold: max Hamming distance to consider similar (default 10 out of 64)
  static bool areSimilar(String hash1, String hash2, {int threshold = 10}) {
    return hammingDistance(hash1, hash2) <= threshold;
  }

  /// Find similar items from a list of hashes
  /// Returns list of indices that are similar to the given hash
  static List<int> findSimilar(
    String targetHash,
    List<String> existingHashes, {
    int threshold = 10,
  }) {
    final similar = <int>[];
    for (var i = 0; i < existingHashes.length; i++) {
      if (areSimilar(targetHash, existingHashes[i], threshold: threshold)) {
        similar.add(i);
      }
    }
    return similar;
  }
}
