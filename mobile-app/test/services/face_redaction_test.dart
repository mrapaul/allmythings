import 'dart:typed_data';

import 'package:all_my_things/services/face_redaction.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

class _FakeFaceDetector implements FaceDetector {
  _FakeFaceDetector(this._faces);
  final List<FaceBox> _faces;
  int callCount = 0;

  @override
  Future<List<FaceBox>> detect(img.Image frame) async {
    callCount++;
    return List<FaceBox>.from(_faces);
  }
}

void main() {
  group('FaceRedactor.redact', () {
    test('blurs each face region (high-frequency content gets smoothed)', () async {
      // 128×128 frame with a checkerboard inside the face box. Gaussian blur
      // averages neighbouring black/white squares so post-blur pixels are no
      // longer pure black or pure white.
      final src = img.Image(width: 128, height: 128);
      img.fill(src, color: img.ColorRgb8(120, 120, 120));
      for (var y = 32; y < 96; y++) {
        for (var x = 32; x < 96; x++) {
          final v = ((x ~/ 4) + (y ~/ 4)) % 2 == 0 ? 0 : 255;
          src.setPixel(x, y, img.ColorRgb8(v, v, v));
        }
      }
      final bytes = Uint8List.fromList(img.encodePng(src));
      final detector = _FakeFaceDetector([
        const FaceBox(x: 32, y: 32, width: 64, height: 64),
      ]);
      final redacted = await FaceRedactor(detector: detector).redact(bytes);

      final out = img.decodeImage(redacted)!;
      // Sample a few pixels inside the face region — none should be pure
      // black or pure white after blur.
      final samples = <(int, int, int)>[];
      for (final (x, y) in const [(48, 48), (60, 60), (50, 70)]) {
        final p = out.getPixel(x, y);
        samples.add((p.r.toInt(), p.g.toInt(), p.b.toInt()));
      }
      // At least one sample must NOT be pure black/white (blur worked).
      expect(
        samples.any((s) => s != (0, 0, 0) && s != (255, 255, 255)),
        isTrue,
      );
    });

    test('zeroes the original buffer after redact', () async {
      final src = img.Image(width: 32, height: 32);
      img.fill(src, color: img.ColorRgb8(70, 70, 70));
      final bytes = Uint8List.fromList(img.encodePng(src));
      await FaceRedactor(detector: _FakeFaceDetector([])).redact(bytes);
      expect(bytes.every((b) => b == 0), isTrue);
    });

    test('handles zero-faces case (no-op except encode)', () async {
      final src = img.Image(width: 32, height: 32);
      img.fill(src, color: img.ColorRgb8(99, 99, 99));
      final bytes = Uint8List.fromList(img.encodePng(src));
      final detector = _FakeFaceDetector([]);
      final redacted = await FaceRedactor(detector: detector).redact(bytes);
      expect(redacted, isA<Uint8List>());
      expect(detector.callCount, 1);
    });

    test('clamps face boxes that overflow the frame', () async {
      final src = img.Image(width: 32, height: 32);
      img.fill(src, color: img.ColorRgb8(0, 0, 0));
      final bytes = Uint8List.fromList(img.encodePng(src));
      final detector = _FakeFaceDetector([
        const FaceBox(x: 30, y: 30, width: 100, height: 100),
      ]);
      // Should not throw — the clamp inside FaceRedactor handles it.
      await FaceRedactor(detector: detector).redact(bytes);
    });

    test('throws on undecodable input', () async {
      final junk = Uint8List.fromList([0, 1, 2]);
      final detector = _FakeFaceDetector([]);
      await expectLater(
        FaceRedactor(detector: detector).redact(junk),
        throwsA(isA<FormatException>()),
      );
    });
  });
}
