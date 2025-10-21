import 'dart:io';
import 'package:dio/dio.dart';
import 'package:fpdart/fpdart.dart';
import '../../core/errors/failures.dart';
import '../../core/config/app_config.dart';
import '../../domain/models/detection_response.dart';
import '../remote/api_client.dart';

/// Repository for object detection via API
class DetectionRepository {
  final ApiClient _apiClient;

  DetectionRepository(this._apiClient);

  /// Detect objects in image
  Future<Either<Failure, DetectionResponse>> detectObjects(File imageFile) async {
    try {
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(
          imageFile.path,
          filename: 'image.jpg',
        ),
        'minConfidence': AppConfig.minConfidence,
      });

      final response = await _apiClient.dio.post(
        '/v1/detect',
        data: formData,
      );

      final detectionResponse = DetectionResponse.fromJson(
        response.data as Map<String, dynamic>,
      );

      return right(detectionResponse);
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return left(
          const Failure.network(
            message: 'Request timeout. Please check your internet connection.',
          ),
        );
      } else if (e.response != null) {
        return left(
          Failure.network(
            message: 'API error: ${e.response?.statusMessage}',
            statusCode: e.response?.statusCode,
          ),
        );
      } else {
        return left(
          Failure.network(
            message: 'Network error: ${e.message}',
          ),
        );
      }
    } catch (e) {
      return left(
        Failure.unexpected(
          message: 'Failed to detect objects: $e',
        ),
      );
    }
  }
}
