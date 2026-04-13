import 'dart:async';
import 'dart:io';
import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/native/coreml_detector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockDetectionRepository extends Mock implements DetectionRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(File(''));
  });

  tearDown(() {
    CoreMLDetector.detectOverride = null;
  });

  group('DetectionNotifier three-tier flow', () {
    test('shows isEnriching=true after CoreML, false after deep pass', () async {
      final repo = MockDetectionRepository();
      final completer = Completer<DetectionResult>();

      when(() => repo.detectObjects(any())).thenAnswer((_) => completer.future);

      // Inject CoreML fake results via static override
      CoreMLDetector.detectOverride = (_) async => [
        CoreMLBox(label: 'chair', confidence: 0.85, boxIndex: 0,
            x: 0.1, y: 0.1, width: 0.3, height: 0.4),
      ];

      final container = ProviderContainer(
        overrides: [
          detectionRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(detectionProvider.notifier);

      final file = File('test_image.jpg');
      final detectFuture = notifier.detectObjects(file);

      // After CoreML runs, state should be success with isEnriching=true
      await Future.delayed(Duration.zero);
      final stateAfterCoreML = container.read(detectionProvider);
      expect(stateAfterCoreML, isA<DetectionSuccess>());
      expect((stateAfterCoreML as DetectionSuccess).isEnriching, true);

      // Complete the deep pass
      completer.complete(DetectionResult(
        detections: [],
        detector: 'yoloe',
        classifier: 'ollama',
        processingTimeMs: 3000,
      ));
      await detectFuture;

      final finalState = container.read(detectionProvider);
      expect(finalState, isA<DetectionSuccess>());
      expect((finalState as DetectionSuccess).isEnriching, false);
      expect(finalState.classifier, 'ollama');
    });
  });
}
