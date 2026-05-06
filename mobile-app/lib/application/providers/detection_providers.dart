import 'dart:io';

import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/application/state/scene_detection_state.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for detection repository
final detectionRepositoryProvider = Provider<DetectionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

/// Legacy single-frame detection notifier. Kept for callers that
/// haven't migrated to [SceneDetectionNotifier] (gallery-import code
/// path). New code should prefer the scene notifier.
class DetectionNotifier extends Notifier<DetectionState> {
  @override
  DetectionState build() => const DetectionState.initial();

  /// Detect objects via the Mac pipeline-service. Single path — no
  /// client-side detection.
  Future<DetectionResult> detectObjects(File imageFile) async {
    state = const DetectionState.loading();
    try {
      final repository = ref.read(detectionRepositoryProvider);
      debugPrint('[DETECT] Calling Mac pipeline-service...');
      final result = await repository.detectObjects(imageFile);
      debugPrint(
        '[DETECT] Pipeline returned ${result.detections.length} detections '
        'in ${result.processingTimeMs}ms',
      );
      state = DetectionState.success(
        detections: result.detections,
        processingTimeMs: result.processingTimeMs,
        detector: result.detector,
        classifier: result.classifier,
        corroborationCount: result.corroborationCount,
        isEnriching: false,
      );
      return result;
    } catch (e, st) {
      debugPrint('[DETECT] pipeline call failed: $e\n$st');
      state = DetectionState.error(e.toString());
      rethrow;
    }
  }

  /// Reset state
  void reset() {
    state = const DetectionState.initial();
  }
}

/// Provider for detection state notifier
final detectionProvider =
    NotifierProvider<DetectionNotifier, DetectionState>(
  DetectionNotifier.new,
);

/// Scene-based detection notifier. Emits [SceneObservation] through
/// [SceneDetectionState]; the canonical post-rewrite path. The legacy
/// [DetectionNotifier] above is retained for the gallery-import flow
/// only.
class SceneDetectionNotifier extends Notifier<SceneDetectionState> {
  @override
  SceneDetectionState build() => const SceneDetectionState.initial();

  Future<SceneObservation> detectScene(File imageFile) async {
    state = const SceneDetectionState.loading();
    try {
      final repository = ref.read(detectionRepositoryProvider);
      final obs = await repository.detectScene(imageFile);
      state = SceneDetectionState.success(observation: obs);
      return obs;
    } catch (e, st) {
      debugPrint('[DETECT-SCENE] failed: $e\n$st');
      state = SceneDetectionState.error(e.toString());
      rethrow;
    }
  }

  void reset() {
    state = const SceneDetectionState.initial();
  }
}

final sceneDetectionProvider =
    NotifierProvider<SceneDetectionNotifier, SceneDetectionState>(
  SceneDetectionNotifier.new,
);
