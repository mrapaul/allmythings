/// §9 — full burst-capture pipeline orchestrator.
///
/// Wires the four section-08 services together:
///   BurstCamera  → captures 3 frames at ~100ms intervals
///   ImageQuality → blur + exposure pre-check (per frame)
///   FaceRedactor → ML Kit face detection + Gaussian blur (per frame)
///   UploadEncoder → resize 1280px + EXIF strip + zero-original (per frame)
///
/// Output: a list of three encoded, redacted frames ready for the
/// detection_repository's multipart upload.  The coordinator surfaces
/// the per-frame quality so the screen can prompt a retake when the
/// whole burst is blurry.
///
/// Encode runs in a background isolate (compute()) so 12MP captures
/// don't block the main isolate's UI thread during JPEG re-encoding.
library;

import 'dart:typed_data';

import 'package:flutter/foundation.dart' show compute;
import 'package:logging/logging.dart';

import 'burst_capture.dart';
import 'face_redaction.dart';
import 'image_quality.dart';
import 'upload_encoder.dart';

final _log = Logger('BurstCaptureCoordinator');

class BurstUpload {
  const BurstUpload({
    required this.frames,
    required this.qualities,
    required this.allBlurry,
  });

  /// Encoded redacted frames; each is the full byte payload for a multipart
  /// part.  Length is always 3 in v1 (the burst).
  final List<Uint8List> frames;

  /// Per-frame quality assessment from ImageQuality.evaluate().
  final List<FrameQuality> qualities;

  /// True when every captured frame failed the blur threshold — UI should
  /// prompt a retake.
  final bool allBlurry;
}

class BurstCaptureCoordinator {
  BurstCaptureCoordinator({
    required this.camera,
    required this.faceDetector,
    ImageQuality? imageQuality,
    UploadEncoder? uploadEncoder,
    int frameCount = 3,
    int intervalMs = 100,
    int gaussianRadius = 31,
  })  : _capture = BurstCapture(
          camera: camera,
          imageQuality: imageQuality ?? ImageQuality(),
          frameCount: frameCount,
          intervalMs: intervalMs,
        ),
        _imageQuality = imageQuality ?? ImageQuality(),
        _uploadEncoder = uploadEncoder ?? UploadEncoder(),
        _faceRedactor = FaceRedactor(
          detector: faceDetector,
          gaussianRadius: gaussianRadius,
        );

  final BurstCamera camera;
  final FaceDetector faceDetector;

  final BurstCapture _capture;
  // ignore: unused_field — kept on the instance for future debug telemetry
  final ImageQuality _imageQuality;
  final UploadEncoder _uploadEncoder;
  final FaceRedactor _faceRedactor;

  /// Run the full burst pipeline and return the upload-ready frames.
  ///
  /// On allBlurry==true the caller should prompt a retake instead of
  /// uploading; the burst itself is still returned so the UI can surface
  /// the blurry-shake feedback.
  Future<BurstUpload> capture() async {
    final captureStart = DateTime.now();
    final result = await _capture.capture();
    final captureMs =
        DateTime.now().difference(captureStart).inMilliseconds;

    final blurryCount = result.qualities.where((q) => q.blurry).length;
    _log.info(
      'burst captured: frames=${result.frames.length} '
      'capture_ms=$captureMs blurry=$blurryCount/${result.frames.length} '
      'allBlurry=${result.allBlurry}',
    );

    final processed = <Uint8List>[];
    for (var i = 0; i < result.frames.length; i++) {
      final frame = result.frames[i];
      final frameStart = DateTime.now();
      // FaceRedactor zeroes the original buffer; we keep a working copy of
      // the redacted bytes that UploadEncoder will then re-zero after
      // encoding. No un-redacted bytes survive past this method.
      final redacted = await _faceRedactor.redact(frame);
      final redactMs =
          DateTime.now().difference(frameStart).inMilliseconds;
      final encStart = DateTime.now();
      // Run encode in a background isolate so high-res JPEG re-encode
      // doesn't block the UI thread. The isolate copies bytes across so
      // the main-isolate redacted buffer is no longer the source of
      // truth — we still zero it here for defence-in-depth.
      final encoded = await compute(
        _encodeIsolate,
        _EncodeRequest(
          bytes: redacted,
          longestEdge: _uploadEncoder.longestEdge,
          quality: _uploadEncoder.quality,
        ),
      );
      // Defence-in-depth: zero the redacted buffer in the main isolate.
      // The isolate copy is also zeroed by UploadEncoder.encode internals.
      for (var b = 0; b < redacted.length; b++) redacted[b] = 0;
      final encMs = DateTime.now().difference(encStart).inMilliseconds;
      _log.fine(
        'frame $i processed: redact_ms=$redactMs '
        'encode_ms=$encMs out_bytes=${encoded.length}',
      );
      processed.add(encoded);
    }
    return BurstUpload(
      frames: processed,
      qualities: result.qualities,
      allBlurry: result.allBlurry,
    );
  }
}

/// Top-level (isolate-callable) encode request payload.
class _EncodeRequest {
  const _EncodeRequest({
    required this.bytes,
    required this.longestEdge,
    required this.quality,
  });
  final Uint8List bytes;
  final int longestEdge;
  final int quality;
}

/// Top-level (isolate-callable) entry point used by [compute]. Must be
/// a top-level or static function — closures don't survive isolate
/// transport. Returns the encoded bytes (the inner UploadEncoder.encode
/// already zeroes the input buffer in-place inside the isolate).
Uint8List _encodeIsolate(_EncodeRequest req) {
  final encoder = UploadEncoder(
    longestEdge: req.longestEdge,
    quality: req.quality,
  );
  // The isolate gets its own copy of the bytes — modifying it here
  // doesn't affect the main isolate's redacted buffer.
  return encoder.encode(req.bytes).bytes;
}
