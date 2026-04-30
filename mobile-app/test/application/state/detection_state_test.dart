import 'package:all_my_things/application/state/detection_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DetectionState.success', () {
    test('isEnriching defaults to false', () {
      const DetectionSuccess state = DetectionSuccess(
        detections: [],
        processingTimeMs: 100,
        detector: 'pipeline',
        classifier: 'none',
      );
      expect(state.isEnriching, false);
    });

    test('isEnriching can be set to true for fast-pass display', () {
      const DetectionSuccess state = DetectionSuccess(
        detections: [],
        processingTimeMs: 0,
        detector: 'pipeline',
        classifier: 'none',
        isEnriching: true,
      );
      expect(state.isEnriching, true);
    });
  });
}
