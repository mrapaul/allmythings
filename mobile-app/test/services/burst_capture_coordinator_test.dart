import 'dart:typed_data';

import 'package:all_my_things/services/burst_capture.dart';
import 'package:all_my_things/services/burst_capture_coordinator.dart';
import 'package:all_my_things/services/face_redaction.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

class _FakeCam implements BurstCamera {
  _FakeCam(this._frames);
  final List<Uint8List> _frames;
  @override
  Future<List<Uint8List>> capture({required int count, required int intervalMs}) async {
    return _frames.take(count).toList();
  }
}

class _NoFaces implements FaceDetector {
  @override
  Future<List<FaceBox>> detect(img.Image frame) async => const [];
}

Uint8List _png({required int colour, int size = 64}) {
  final src = img.Image(width: size, height: size);
  img.fill(src, color: img.ColorRgb8(colour, colour, colour));
  return Uint8List.fromList(img.encodePng(src));
}

Uint8List _checker({int size = 64}) {
  final src = img.Image(width: size, height: size);
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      final v = ((x ~/ 2) + (y ~/ 2)) % 2 == 0 ? 0 : 255;
      src.setPixel(x, y, img.ColorRgb8(v, v, v));
    }
  }
  return Uint8List.fromList(img.encodePng(src));
}

void main() {
  group('BurstCaptureCoordinator.capture', () {
    test('returns 3 encoded frames + per-frame qualities', () async {
      final coord = BurstCaptureCoordinator(
        camera: _FakeCam(List.generate(3, (_) => _checker())),
        faceDetector: _NoFaces(),
      );
      final upload = await coord.capture();
      expect(upload.frames.length, 3);
      expect(upload.qualities.length, 3);
      for (final f in upload.frames) {
        // JPEG SOI marker present (UploadEncoder produces JPEG in section-08;
        // production wires WebP via flutter_image_compress).
        expect(f[0], 0xFF);
        expect(f[1], 0xD8);
      }
    });

    test('allBlurry==true when every frame is flat-grey', () async {
      final coord = BurstCaptureCoordinator(
        camera: _FakeCam(List.generate(3, (_) => _png(colour: 100))),
        faceDetector: _NoFaces(),
      );
      final upload = await coord.capture();
      expect(upload.allBlurry, isTrue);
    });

    test('allBlurry==false when at least one frame has detail', () async {
      final coord = BurstCaptureCoordinator(
        camera: _FakeCam([_png(colour: 100), _checker(), _png(colour: 100)]),
        faceDetector: _NoFaces(),
      );
      final upload = await coord.capture();
      expect(upload.allBlurry, isFalse);
    });
  });
}
