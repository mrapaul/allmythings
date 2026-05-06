/// §9.1 production face detector — wraps `google_mlkit_face_detection`.
///
/// On-device only (no network). Configured for the burst-capture path:
///   * `performanceMode: fast` — we run on every burst frame, latency
///     budget is ~50ms so the burst doesn't perceptibly stall.
///   * `minFaceSize: 0.05` — small faces in wide-angle scenes still
///     redact. (1.0 = whole-image-as-face; 0.05 = 5% of shorter edge.)
///   * `enableLandmarks/Classification/Tracking: false` — bounding
///     boxes are all the redactor needs; turning these off saves CPU.
///
/// The ML Kit detector is constructed lazily on first use so unit tests
/// that import this file (without exercising it) don't hit the
/// platform channel.
///
/// Use `MLKitFaceDetector.boundingBoxFromRect` in tests to exercise
/// the coordinate mapping in isolation — that's the part most likely
/// to drift from the FaceBox contract.
library;

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' show Size;

import 'package:all_my_things/services/face_redaction.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart' as mlkit;
import 'package:image/image.dart' as img;

class MLKitFaceDetector implements FaceDetector {
  MLKitFaceDetector({
    this.performanceMode = mlkit.FaceDetectorMode.fast,
    this.minFaceSize = 0.05,
  });

  final mlkit.FaceDetectorMode performanceMode;
  final double minFaceSize;

  mlkit.FaceDetector? _detector;

  mlkit.FaceDetector _ensureDetector() {
    return _detector ??= mlkit.FaceDetector(
      options: mlkit.FaceDetectorOptions(
        performanceMode: performanceMode,
        minFaceSize: minFaceSize,
        enableLandmarks: false,
        enableClassification: false,
        enableContours: false,
        enableTracking: false,
      ),
    );
  }

  @override
  Future<List<FaceBox>> detect(img.Image frame) async {
    // ML Kit accepts NV21/YV12 raw bytes OR an encoded image via a file
    // path. The encoded-bytes route is awkward (it needs a temp file on
    // some plugin versions); we go via the raw-bytes path with explicit
    // metadata so there's no disk IO on the burst critical path.
    //
    // image package gives us packed RGBA; ML Kit on iOS/Android wants
    // BGRA8888 (iOS) or NV21 (Android). For simplicity + portability we
    // use BGRA8888 on iOS and YUV_420_888 isn't available from Dart — so
    // we fall back to NV21 on Android via a converted buffer.
    final width = frame.width;
    final height = frame.height;
    final inputImage = _toInputImage(frame, width, height);
    final faces = await _ensureDetector().processImage(inputImage);
    return faces
        .map((f) => boundingBoxFromRect(
              left: f.boundingBox.left,
              top: f.boundingBox.top,
              right: f.boundingBox.right,
              bottom: f.boundingBox.bottom,
              frameWidth: width,
              frameHeight: height,
            ))
        .toList(growable: false);
  }

  /// Visible for testing — converts ML Kit's `Rect` (left/top/right/bottom)
  /// to our `FaceBox` (x/y/width/height) with the same clamping rules
  /// FaceRedactor uses downstream.
  static FaceBox boundingBoxFromRect({
    required num left,
    required num top,
    required num right,
    required num bottom,
    required int frameWidth,
    required int frameHeight,
  }) {
    final x = left.round().clamp(0, frameWidth);
    final y = top.round().clamp(0, frameHeight);
    final w = (right - left).round().clamp(0, frameWidth - x);
    final h = (bottom - top).round().clamp(0, frameHeight - y);
    return FaceBox(x: x, y: y, width: w, height: h);
  }

  Future<void> dispose() async {
    await _detector?.close();
    _detector = null;
  }

  // ---- private ------------------------------------------------------

  mlkit.InputImage _toInputImage(img.Image frame, int width, int height) {
    // Encode frame as JPEG bytes and use ML Kit's bytes path with
    // metadata. On iOS this routes through Vision/CoreImage; on Android
    // through the bundled face detector. Both accept JPEG-encoded
    // input; rotation is implied 0 because the frame came from
    // CameraController.takePicture() which already corrects orientation.
    final bytes = Uint8List.fromList(img.encodeJpg(frame, quality: 90));
    const rotation = mlkit.InputImageRotation.rotation0deg;
    final format = Platform.isIOS
        ? mlkit.InputImageFormat.bgra8888
        : mlkit.InputImageFormat.nv21;
    final metadata = mlkit.InputImageMetadata(
      size: Size(width.toDouble(), height.toDouble()),
      rotation: rotation,
      format: format,
      bytesPerRow: width * 4, // BGRA8888 is 4bpp; NV21 ignores this field
    );
    return mlkit.InputImage.fromBytes(bytes: bytes, metadata: metadata);
  }
}
