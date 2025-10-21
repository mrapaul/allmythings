import 'package:freezed_annotation/freezed_annotation.dart';

part 'failures.freezed.dart';

/// Base failure type for error handling with fpdart Either
@freezed
class Failure with _$Failure {
  const factory Failure.network({
    required String message,
    int? statusCode,
  }) = NetworkFailure;

  const factory Failure.storage({
    required String message,
  }) = StorageFailure;

  const factory Failure.vision({
    required String message,
  }) = VisionFailure;

  const factory Failure.camera({
    required String message,
  }) = CameraFailure;

  const factory Failure.permission({
    required String message,
  }) = PermissionFailure;

  const factory Failure.unexpected({
    required String message,
  }) = UnexpectedFailure;
}
