import 'dart:io';

import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/native/coreml_detector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for detection repository
final detectionRepositoryProvider = Provider<DetectionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

/// Notifier for managing detection state
class DetectionNotifier extends Notifier<DetectionState> {
  @override
  DetectionState build() => const DetectionState.initial();

  /// Detect objects using three-tier cascade:
  /// 1. CoreML on-device (instant, ~50ms)
  /// 2. Mac deep pass via API (rich attributes, ~5–15s)
  /// 3. Falls back to CoreML-only on Mac failure (offline mode)
  Future<DetectionResult> detectObjects(File imageFile) async {
    state = const DetectionState.loading();

    // Tier 1: CoreML on-device — instant, no network
    final fastBoxes = await CoreMLDetector.detect(imageFile);
    if (fastBoxes.isNotEmpty) {
      state = DetectionState.success(
        detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
        processingTimeMs: 0,
        detector: 'coreml',
        classifier: 'none',
        isEnriching: true, // shimmer while deep pass runs
      );
    }

    // Tier 2: Mac deep pass (enriched attributes)
    try {
      final repository = ref.read(detectionRepositoryProvider);
      final result = await repository.detectObjects(imageFile);

      if (result.detections.isEmpty && fastBoxes.isNotEmpty) {
        // Deep pass found nothing — keep CoreML boxes but use deep pass metadata
        final coreMLDetections =
            fastBoxes.map(_coreMLBoxToDetectedObject).toList();
        state = DetectionState.success(
          detections: coreMLDetections,
          processingTimeMs: result.processingTimeMs,
          detector: result.detector,
          classifier: result.classifier,
          isEnriching: false,
        );
        return DetectionResult(
          detections: coreMLDetections,
          detector: result.detector,
          classifier: result.classifier,
          processingTimeMs: result.processingTimeMs,
        );
      }

      state = DetectionState.success(
        detections: result.detections,
        processingTimeMs: result.processingTimeMs,
        detector: result.detector,
        classifier: result.classifier,
        corroborationCount: result.corroborationCount,
        isEnriching: false,
      );
      return result;
    } catch (e) {
      if (fastBoxes.isNotEmpty) {
        // Mac unreachable — show CoreML results with offline indicator
        state = DetectionState.success(
          detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
          processingTimeMs: 0,
          detector: 'coreml',
          classifier: 'offline',
          isEnriching: false,
        );
        return DetectionResult(
          detections: fastBoxes.map(_coreMLBoxToDetectedObject).toList(),
          detector: 'coreml',
          classifier: 'offline',
          processingTimeMs: 0,
        );
      }
      state = DetectionState.error(e.toString());
      rethrow;
    }
  }

  /// Reset state
  void reset() {
    state = const DetectionState.initial();
  }

  DetectedObject _coreMLBoxToDetectedObject(CoreMLBox box) {
    return DetectedObject(
      boxIndex: box.boxIndex,
      label: box.label,
      category: 'object',
      confidence: box.confidence,
      boundingBox: BoundingBox(
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      ),
    );
  }
}

/// Provider for detection state notifier
final detectionProvider =
    NotifierProvider<DetectionNotifier, DetectionState>(
  DetectionNotifier.new,
);
