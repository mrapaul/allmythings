/// §9.2 upload_encoder — resize longest edge to 1280 + EXIF strip + original
/// disposal after encode.
///
/// The pure-Dart `image` package only DECODES WebP, not encodes it. Section-08
/// ships JPEG encoding here as the unit-test-friendly path; production swaps
/// in WebP via `flutter_image_compress` (a platform plugin) at the call
/// site without changing this contract.
///
/// `originalBytes` is zeroed in place after encoding so the un-redacted
/// source cannot be recovered from memory.
library;

import 'dart:typed_data';

import 'package:image/image.dart' as img;

enum EncoderFormat { jpeg, webp }

class EncodedFrame {
  const EncodedFrame(this.bytes, this.format);
  final Uint8List bytes;
  final EncoderFormat format;
}

class UploadEncoder {
  UploadEncoder({
    this.longestEdge = 1280,
    this.quality = 75,
  });

  final int longestEdge;
  final int quality;

  /// Decode → resize (preserving aspect) → encode → strip EXIF.
  /// Zeroes [originalBytes] in place after a successful encode.
  EncodedFrame encode(Uint8List originalBytes) {
    img.Image? decoded;
    try {
      decoded = img.decodeImage(originalBytes);
    } catch (_) {
      throw const FormatException('upload_encoder: undecodable input');
    }
    if (decoded == null) {
      throw const FormatException('upload_encoder: undecodable input');
    }
    final resized = _resizeLongestEdge(decoded, longestEdge);
    final stripped = img.Image.from(resized)..exif = img.ExifData();
    final bytes = img.encodeJpg(stripped, quality: quality);
    // Zero the source buffer in place — cannot recover the un-redacted frame.
    for (var i = 0; i < originalBytes.length; i++) {
      originalBytes[i] = 0;
    }
    return EncodedFrame(Uint8List.fromList(bytes), EncoderFormat.jpeg);
  }

  img.Image _resizeLongestEdge(img.Image src, int target) {
    final w = src.width;
    final h = src.height;
    final maxSide = w >= h ? w : h;
    if (maxSide <= target) return src;
    if (w >= h) {
      return img.copyResize(src, width: target);
    }
    return img.copyResize(src, height: target);
  }
}
