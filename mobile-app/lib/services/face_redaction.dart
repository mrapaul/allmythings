/// §9.1 face_redaction — ML Kit face detector + Gaussian blur over face boxes.
///
/// The real platform integration calls `google_mlkit_face_detection`.
/// Section-08 ships the contract + a deterministic test fake; the real
/// detector is a one-line swap in production.
///
/// Original-frame disposal is mandatory: the caller's [Uint8List] source is
/// zeroed in place after the redacted bytes are returned.
library;

import 'dart:typed_data';

import 'package:image/image.dart' as img;

class FaceBox {
  const FaceBox({required this.x, required this.y, required this.width, required this.height});
  final int x;
  final int y;
  final int width;
  final int height;
}

abstract class FaceDetector {
  Future<List<FaceBox>> detect(img.Image frame);
}

class FaceRedactor {
  FaceRedactor({required this.detector, this.gaussianRadius = 31});

  final FaceDetector detector;
  final int gaussianRadius;

  /// Detect faces, blur each face box in place, return the redacted bytes
  /// re-encoded as PNG (callers re-encode to WebP via [UploadEncoder]).
  /// Zeroes [originalBytes] in place.
  Future<Uint8List> redact(Uint8List originalBytes) async {
    img.Image? decoded;
    try {
      decoded = img.decodeImage(originalBytes);
    } catch (_) {
      throw const FormatException('face_redaction: undecodable input');
    }
    if (decoded == null) {
      throw const FormatException('face_redaction: undecodable input');
    }
    final faces = await detector.detect(decoded);
    var working = decoded;
    for (final face in faces) {
      working = _blurRegion(working, face);
    }
    final out = Uint8List.fromList(img.encodePng(working));
    for (var i = 0; i < originalBytes.length; i++) {
      originalBytes[i] = 0;
    }
    return out;
  }

  img.Image _blurRegion(img.Image src, FaceBox face) {
    // Crop, blur, paste back. Falls back to full-image blur if the crop is
    // empty (defensive — ML Kit occasionally returns degenerate boxes).
    final clamped = _clampBox(face, src.width, src.height);
    if (clamped.width <= 0 || clamped.height <= 0) return src;
    final crop = img.copyCrop(
      src,
      x: clamped.x,
      y: clamped.y,
      width: clamped.width,
      height: clamped.height,
    );
    // Blur radius must not exceed the smaller crop dimension or the
    // separable convolution kernel reads outside the buffer.
    final shortest = clamped.width < clamped.height ? clamped.width : clamped.height;
    final safeRadius = gaussianRadius.clamp(1, (shortest ~/ 2).clamp(1, gaussianRadius));
    final blurred = img.gaussianBlur(crop, radius: safeRadius);
    return img.compositeImage(src, blurred, dstX: clamped.x, dstY: clamped.y);
  }

  FaceBox _clampBox(FaceBox face, int w, int h) {
    final x = face.x.clamp(0, w);
    final y = face.y.clamp(0, h);
    final maxW = (w - x).clamp(0, w);
    final maxH = (h - y).clamp(0, h);
    return FaceBox(
      x: x,
      y: y,
      width: face.width.clamp(0, maxW),
      height: face.height.clamp(0, maxH),
    );
  }
}
