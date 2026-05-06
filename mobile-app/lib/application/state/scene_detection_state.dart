// section-08 §8: state machine for the new single-path scene-detection
// flow. Mirrors DetectionState's lifecycle (initial → loading → success
// | empty | error) but carries a SceneObservation instead of the legacy
// DetectedObject list.
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'scene_detection_state.freezed.dart';

@freezed
sealed class SceneDetectionState with _$SceneDetectionState {
  const factory SceneDetectionState.initial() = SceneDetectionInitial;
  const factory SceneDetectionState.loading() = SceneDetectionLoading;
  const factory SceneDetectionState.success({
    required SceneObservation observation,
  }) = SceneDetectionSuccess;
  const factory SceneDetectionState.empty() = SceneDetectionEmpty;
  const factory SceneDetectionState.error(String message) =
      SceneDetectionError;
}
