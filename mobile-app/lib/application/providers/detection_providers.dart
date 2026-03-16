import 'dart:io';

import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
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

  /// Detect objects in image file
  Future<DetectionResult> detectObjects(File imageFile) async {
    state = const DetectionState.loading();

    try {
      final repository = ref.read(detectionRepositoryProvider);
      final result = await repository.detectObjects(imageFile);

      if (result.detections.isEmpty) {
        state = const DetectionState.empty();
      } else {
        state = DetectionState.success(
          detections: result.detections,
          processingTimeMs: result.processingTimeMs,
          detector: result.detector,
          classifier: result.classifier,
          corroborationCount: result.corroborationCount,
        );
      }
      return result;
    } catch (e) {
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
