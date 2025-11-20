import 'dart:io';
import 'package:dio/dio.dart';
import 'package:fpdart/fpdart.dart';
import '../../models/detection_response.dart';
import '../remote/api_client.dart';

/// Repository for object detection via API
class DetectionRepository {
  DetectionRepository(this._apiClient);
  final ApiClient _apiClient;

  /// Detect objects in image
  Future<Either<String, DetectionResponse>> detectObjects(File imageFile) async {
    try {
      final fileName = imageFile.path.split('/').last;
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(imageFile.path, filename: fileName),
      });
      final response = await _apiClient.dio.post('/detect', data: formData);
      return right(DetectionResponse.fromJson(response.data));
    } catch (e) {
      return left('Failed to detect objects: $e');
    }
  }
}
