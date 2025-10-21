import 'package:freezed_annotation/freezed_annotation.dart';
import '../../domain/models/detection_response.dart';
import '../../core/errors/failures.dart';

part 'detection_state.freezed.dart';

/// State for detection process
@freezed
class DetectionState with _$DetectionState {
  const factory DetectionState.initial() = _Initial;
  const factory DetectionState.loading() = _Loading;
  const factory DetectionState.success(DetectionResponse response) = _Success;
  const factory DetectionState.error(Failure failure) = _Error;
}
