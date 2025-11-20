import 'package:freezed_annotation/freezed_annotation.dart';

part 'server_failure.freezed.dart';

@freezed
class ServerFailure with _$ServerFailure {
  const factory ServerFailure(String message) = _ServerFailure;

  const factory ServerFailure.networkError() = NetworkError;
  const factory ServerFailure.serverError(String message) = ServerError;
  const factory ServerFailure.unauthorized() = Unauthorized;
  const factory ServerFailure.notFound() = NotFound;
  const factory ServerFailure.permissionDenied() = PermissionDenied;
  const factory ServerFailure.validationError(String message) = ValidationError;

  @override
  String toString() {
    return when(
      (message) => 'ServerFailure: $message',
      networkError: () => 'Network error occurred',
      serverError: (message) => 'Server error: $message',
      unauthorized: () => 'Unauthorized access',
      notFound: () => 'Resource not found',
      permissionDenied: () => 'Permission denied',
      validationError: (message) => 'Validation error: $message',
    );
  }
}
