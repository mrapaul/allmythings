/// §9.1 burst_capture — 3-frame burst, send all 3 (no best-frame pick).
///
/// The capture contract is decoupled from the camera plugin so this file
/// is pure-Dart and unit-testable. A fake [BurstCamera] is injected in
/// tests; production wires the real `camera` package implementation.
library;

import 'dart:typed_data';

import 'image_quality.dart';
import 'package:image/image.dart' as img;

abstract class BurstCamera {
  /// Capture exactly [count] frames at approximately [intervalMs] apart.
  Future<List<Uint8List>> capture({required int count, required int intervalMs});
}

class BurstResult {
  const BurstResult({
    required this.frames,
    required this.qualities,
    required this.allBlurry,
  });

  final List<Uint8List> frames;
  final List<FrameQuality> qualities;
  final bool allBlurry;
}

class BurstCapture {
  BurstCapture({
    required this.camera,
    required this.imageQuality,
    this.frameCount = 3,
    this.intervalMs = 100,
  });

  final BurstCamera camera;
  final ImageQuality imageQuality;
  final int frameCount;
  final int intervalMs;

  Future<BurstResult> capture() async {
    final frames = await camera.capture(
      count: frameCount,
      intervalMs: intervalMs,
    );
    if (frames.length != frameCount) {
      throw StateError(
        'burst_capture: camera returned ${frames.length} frames; expected $frameCount',
      );
    }
    final qualities = frames.map((f) {
      final decoded = img.decodeImage(f);
      if (decoded == null) {
        return const FrameQuality(
          laplacianVariance: 0,
          exposure: ExposureClass.okay,
          blurry: true,
        );
      }
      return imageQuality.evaluate(decoded);
    }).toList();
    final allBlurry = qualities.every((q) => q.blurry);
    return BurstResult(
      frames: frames,
      qualities: qualities,
      allBlurry: allBlurry,
    );
  }
}
