import 'dart:typed_data';

import 'package:all_my_things/services/burst_capture.dart';
import 'package:all_my_things/services/image_quality.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

class _FakeBurstCamera implements BurstCamera {
  _FakeBurstCamera(this._frames);
  final List<Uint8List> _frames;

  @override
  Future<List<Uint8List>> capture({required int count, required int intervalMs}) async {
    return _frames.take(count).toList();
  }
}

Uint8List _png({required int colour, int size = 32}) {
  final src = img.Image(width: size, height: size);
  img.fill(src, color: img.ColorRgb8(colour, colour, colour));
  return Uint8List.fromList(img.encodePng(src));
}

Uint8List _checkerboard({int size = 32}) {
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
  group('BurstCapture.capture', () {
    test('returns exactly 3 frames', () async {
      final cam = _FakeBurstCamera([
        _png(colour: 100),
        _png(colour: 100),
        _png(colour: 100),
      ]);
      final result = await BurstCapture(camera: cam, imageQuality: ImageQuality()).capture();
      expect(result.frames.length, 3);
      expect(result.qualities.length, 3);
    });

    test('flat-grey frames → allBlurry=true', () async {
      final cam = _FakeBurstCamera(List.generate(3, (_) => _png(colour: 100)));
      final result = await BurstCapture(camera: cam, imageQuality: ImageQuality()).capture();
      expect(result.allBlurry, isTrue);
    });

    test('checkerboard frames → allBlurry=false', () async {
      final cam = _FakeBurstCamera(List.generate(3, (_) => _checkerboard()));
      final result = await BurstCapture(camera: cam, imageQuality: ImageQuality()).capture();
      expect(result.allBlurry, isFalse);
    });

    test('mixed frames → allBlurry=false (only ALL must be blurry)', () async {
      final cam = _FakeBurstCamera([
        _png(colour: 100),
        _checkerboard(),
        _png(colour: 100),
      ]);
      final result = await BurstCapture(camera: cam, imageQuality: ImageQuality()).capture();
      expect(result.allBlurry, isFalse);
    });

    test('camera returning wrong frame count → StateError', () async {
      final cam = _FakeBurstCamera([_png(colour: 100), _png(colour: 100)]);
      await expectLater(
        BurstCapture(camera: cam, imageQuality: ImageQuality()).capture(),
        throwsA(isA<StateError>()),
      );
    });
  });
}
