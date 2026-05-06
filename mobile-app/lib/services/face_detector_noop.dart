// Section-08 §9.1 face-redaction default: a no-op FaceDetector that
// returns zero face boxes. Suitable for interior-photo scenes where
// faces are not the dominant content; the FaceRedactor still walks the
// disposeOriginal code path so the raw frame buffer is zeroed even in
// the no-face case.
//
// Replace with a `google_mlkit_face_detection` adapter (or equivalent
// platform-native detector) before shipping a build that may capture
// people. The adapter swap is one line in service_providers.dart.
import 'package:image/image.dart' as img;

import 'face_redaction.dart';

class NoOpFaceDetector implements FaceDetector {
  const NoOpFaceDetector();

  @override
  Future<List<FaceBox>> detect(img.Image frame) async => const [];
}
