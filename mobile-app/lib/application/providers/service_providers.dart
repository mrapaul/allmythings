import 'dart:io';

import 'package:all_my_things/data/services/image_processing_service.dart';
import 'package:all_my_things/services/face_detector_mlkit.dart';
import 'package:all_my_things/services/face_detector_noop.dart';
import 'package:all_my_things/services/face_redaction.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for image processing service
final imageProcessingServiceProvider = Provider<ImageProcessingService>((ref) {
  return ImageProcessingService();
});

/// Face detector provider — production builds get the on-device ML Kit
/// detector; tests and any non-iOS/Android host get the NoOp detector
/// which still triggers the FaceRedactor's zero-original guarantee.
///
/// Tests detect the FLUTTER_TEST env var that the test runner sets, so
/// importing service_providers in a widget test won't try to spin up
/// the ML Kit platform channel.
///
/// To force NoOp for debugging on a real device: override this
/// provider in main() before runApp() with a Provider that returns
/// `const NoOpFaceDetector()`.
final faceDetectorProvider = Provider<FaceDetector>((ref) {
  if (Platform.environment.containsKey('FLUTTER_TEST')) {
    return const NoOpFaceDetector();
  }
  if (Platform.isIOS || Platform.isAndroid) {
    return MLKitFaceDetector();
  }
  return const NoOpFaceDetector();
});
