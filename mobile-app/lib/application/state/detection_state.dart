import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detection_state.freezed.dart';

/// State for detection process
@freezed
sealed class DetectionState with _$DetectionState {
  const factory DetectionState.initial() = DetectionInitial;
  const factory DetectionState.loading() = DetectionLoading;
  const factory DetectionState.success({
    required List<DetectedObject> detections,
    required int processingTimeMs,
    required String detector,
    required String classifier,
    int? corroborationCount,
  }) = DetectionSuccess;
  const factory DetectionState.empty() = DetectionEmpty;
  const factory DetectionState.error(String message) = DetectionError;
}
