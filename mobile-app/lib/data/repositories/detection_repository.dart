import 'dart:io';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:dio/dio.dart';

/// Repository for object detection via API
class DetectionRepository {
  DetectionRepository(this._apiClient);
  final ApiClient _apiClient;

  /// Detect objects in image file
  /// Returns a list of detected objects with confidence scores and bounding boxes
  Future<List<Detection>> detectObjects(File imageFile) async {
    try {
      // Prepare multipart form data with image file
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(
          imageFile.path,
          filename: imageFile.path.split('/').last,
        ),
      });

      // Call detection API endpoint
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/v1/detect',
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
        ),
      );

      if (response.statusCode != 200) {
        throw Exception('Detection API returned status code: ${response.statusCode}');
      }

      final data = response.data;
      if (data == null) {
        return [];
      }

      // Parse detections from response
      final detections = data['detections'] as List<dynamic>?;
      if (detections == null || detections.isEmpty) {
        return [];
      }

      // Convert JSON to Detection objects
      return detections
          .map((detection) => Detection.fromJson(detection as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('Detection API error: $e');
      rethrow;
    }
  }
}
