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
library;

import 'dart:typed_data';

import 'burst_capture.dart';
import 'face_redaction.dart';
import 'image_quality.dart';
import 'upload_encoder.dart';

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
    final result = await _capture.capture();
    final processed = <Uint8List>[];
    for (final frame in result.frames) {
      // FaceRedactor zeroes the original buffer; we keep a working copy of
      // the redacted bytes that UploadEncoder will then re-zero after
      // encoding.  No un-redacted bytes survive past this method.
      final redacted = await _faceRedactor.redact(frame);
      final encoded = _uploadEncoder.encode(redacted);
      processed.add(encoded.bytes);
    }
    return BurstUpload(
      frames: processed,
      qualities: result.qualities,
      allBlurry: result.allBlurry,
    );
  }
}
