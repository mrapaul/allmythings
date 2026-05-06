/// Unit tests for MLKitFaceDetector's pure helpers.
///
/// The actual ML Kit `processImage` call hits a platform channel and
/// can't be exercised in a Dart unit test — that's covered by manual
/// device verification. What CAN be tested in isolation is the
/// coordinate mapping from ML Kit's Rect (left/top/right/bottom) to
/// our FaceBox (x/y/width/height) with FaceRedactor's clamping rules.
/// That mapping is the part most likely to silently regress.
library;

import 'package:all_my_things/services/face_detector_mlkit.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MLKitFaceDetector.boundingBoxFromRect', () {
    test('happy-path conversion preserves geometry', () {
      final box = MLKitFaceDetector.boundingBoxFromRect(
        left: 100,
        top: 50,
        right: 300,
        bottom: 250,
        frameWidth: 1280,
        frameHeight: 720,
      );
      expect(box.x, 100);
      expect(box.y, 50);
      expect(box.width, 200);
      expect(box.height, 200);
    });

    test('clamps origin to frame bounds', () {
      // ML Kit can return negative coordinates when a face spans off-edge.
      final box = MLKitFaceDetector.boundingBoxFromRect(
        left: -20,
        top: -10,
        right: 100,
        bottom: 100,
        frameWidth: 1280,
        frameHeight: 720,
      );
      expect(box.x, 0);
      expect(box.y, 0);
      // Width should still be (right - left) = 120, but limited by frame width.
      expect(box.width, 120);
      expect(box.height, 110);
    });

    test('clamps width/height when extending past the frame', () {
      final box = MLKitFaceDetector.boundingBoxFromRect(
        left: 1200,
        top: 700,
        right: 1400, // 1400 > 1280
        bottom: 800, // 800  > 720
        frameWidth: 1280,
        frameHeight: 720,
      );
      expect(box.x, 1200);
      expect(box.y, 700);
      expect(box.x + box.width, lessThanOrEqualTo(1280));
      expect(box.y + box.height, lessThanOrEqualTo(720));
    });

    test('rounds non-integer ML Kit coordinates', () {
      final box = MLKitFaceDetector.boundingBoxFromRect(
        left: 99.4,
        top: 49.6,
        right: 300.5,
        bottom: 249.5,
        frameWidth: 1280,
        frameHeight: 720,
      );
      expect(box.x, 99);
      expect(box.y, 50);
      expect(box.width, 201); // 300.5 - 99.4 = 201.1 → round → 201
      expect(box.height, 200); // 249.5 - 49.6 = 199.9 → round → 200
    });

    test('zero-area boxes survive round-tripping', () {
      // ML Kit occasionally returns a zero-width or zero-height box when
      // the face is at extreme angles. Downstream FaceRedactor falls
      // back gracefully on these.
      final box = MLKitFaceDetector.boundingBoxFromRect(
        left: 100,
        top: 100,
        right: 100,
        bottom: 100,
        frameWidth: 1280,
        frameHeight: 720,
      );
      expect(box.width, 0);
      expect(box.height, 0);
    });
  });
}
