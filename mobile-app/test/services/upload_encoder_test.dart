import 'dart:typed_data';

import 'package:all_my_things/services/upload_encoder.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  group('UploadEncoder.encode', () {
    test('resizes longest edge to 1280', () {
      final src = img.Image(width: 4000, height: 2000);
      img.fill(src, color: img.ColorRgb8(50, 100, 150));
      final bytes = Uint8List.fromList(img.encodePng(src));
      final out = UploadEncoder(longestEdge: 1280).encode(bytes);
      final decoded = img.decodeImage(out.bytes)!;
      // Aspect 2:1 — width clamped to 1280 → height should be ~640.
      expect(decoded.width, 1280);
      expect(decoded.height, inInclusiveRange(635, 645));
    });

    test('preserves aspect ratio', () {
      final src = img.Image(width: 2000, height: 4000);
      img.fill(src, color: img.ColorRgb8(50, 100, 150));
      final bytes = Uint8List.fromList(img.encodePng(src));
      final out = UploadEncoder(longestEdge: 1280).encode(bytes);
      final decoded = img.decodeImage(out.bytes)!;
      expect(decoded.height, 1280);
      expect(decoded.width, inInclusiveRange(635, 645));
    });

    test('returns JPEG-encoded bytes (prod uses WebP via flutter_image_compress)', () {
      final src = img.Image(width: 200, height: 200);
      img.fill(src, color: img.ColorRgb8(10, 10, 10));
      final bytes = Uint8List.fromList(img.encodePng(src));
      final out = UploadEncoder().encode(bytes);
      // JPEG starts with the SOI marker FF D8.
      expect(out.bytes[0], 0xFF);
      expect(out.bytes[1], 0xD8);
      expect(out.format, EncoderFormat.jpeg);
    });

    test('zeroes the original buffer in place', () {
      final src = img.Image(width: 64, height: 64);
      img.fill(src, color: img.ColorRgb8(99, 99, 99));
      final bytes = Uint8List.fromList(img.encodePng(src));
      // Snapshot a sample of pre-encode bytes.
      final pre = Uint8List.fromList(bytes.take(16).toList());
      UploadEncoder().encode(bytes);
      // After encode, every byte of the input buffer must be zero.
      expect(bytes.every((b) => b == 0), isTrue,
          reason: 'original bytes must be zeroed; were ${pre.toList()}');
    });

    test('throws on undecodable input', () {
      final junk = Uint8List.fromList([0, 1, 2, 3, 4, 5]);
      expect(() => UploadEncoder().encode(junk), throwsA(isA<FormatException>()));
    });

    test('shorter frames are NOT upscaled', () {
      final src = img.Image(width: 320, height: 240);
      img.fill(src, color: img.ColorRgb8(10, 20, 30));
      final bytes = Uint8List.fromList(img.encodePng(src));
      final out = UploadEncoder(longestEdge: 1280).encode(bytes);
      final decoded = img.decodeImage(out.bytes)!;
      expect(decoded.width, 320);
      expect(decoded.height, 240);
    });
  });
}
