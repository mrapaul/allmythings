import 'dart:io';

import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for detection repository
final detectionRepositoryProvider = Provider<DetectionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

/// Notifier for managing detection state.
///
/// Section-08: the on-device CoreML "fast path" tier and the offline
/// CoreML fallback are GONE. The phone always calls the Mac pipeline-
/// service via the Fastify edge; there is no client-side detection.
/// Multi-frame burst + on-device pre-checks (blur/exposure/face redaction)
/// happen in the camera screen before this notifier runs.
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
