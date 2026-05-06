// Section-08 §9.1: BurstCamera implementation that wraps the
// `camera` package's CameraController to take 3 photos at ~100 ms
// intervals. Production wiring for the burst pipeline.
//
// Why a thin adapter rather than putting this directly into
// camera_capture_screen: the BurstCapture core is pure-Dart-testable
// against a fake BurstCamera. The adapter is the only file that
// touches the camera plugin, so it's the only file that's hard to
// unit-test (covered by the integration_test layer instead).
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart' show debugPrint;

import 'burst_capture.dart';

class CameraBurstAdapter implements BurstCamera {
  CameraBurstAdapter(this._controller);

  final CameraController _controller;

  @override
  Future<List<Uint8List>> capture({
    required int count,
    required int intervalMs,
  }) async {
    if (count <= 0) return const [];
    final frames = <Uint8List>[];
    final tickStart = DateTime.now();
    for (var i = 0; i < count; i++) {
      // Wait until the desired offset for frame i. We measure from the
      // burst start to absorb shutter jitter — frame 1 doesn't drift
      // because frame 0 took longer than expected.
      if (i > 0) {
        final desiredOffsetMs = i * intervalMs;
        final elapsed = DateTime.now().difference(tickStart).inMilliseconds;
        final delay = desiredOffsetMs - elapsed;
        if (delay > 0) {
          await Future<void>.delayed(Duration(milliseconds: delay));
        }
      }
      try {
        final XFile shot = await _controller.takePicture();
        // Read into memory then nuke the temp file so we don't leak
        // pictures into the OS temp dir between bursts.
        final bytes = await File(shot.path).readAsBytes();
        unawaited(_disposeFile(shot.path));
        frames.add(bytes);
      } catch (e) {
        debugPrint('[BurstCamera] frame $i takePicture failed: $e');
        // Fail the burst — partial bursts upset the cross_frame_dedup
        // signal-class accounting. Higher-level code surfaces a retake.
        rethrow;
      }
    }
    return frames;
  }

  Future<void> _disposeFile(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {
      // Best-effort cleanup; nothing actionable on failure.
    }
  }
}
