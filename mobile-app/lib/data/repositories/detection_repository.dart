import 'dart:io';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:dio/dio.dart';

/// Result of a detection API call
class DetectionResult {
  DetectionResult({
    required this.detections,
    required this.detector,
    required this.classifier,
    required this.processingTimeMs,
    this.corroborationCount,
  });
  final List<DetectedObject> detections;
  final String detector;
  final String classifier;
  final int processingTimeMs;
  final int? corroborationCount;
}

/// Repository for object detection via API
class DetectionRepository {
  DetectionRepository(this._apiClient);
  final ApiClient _apiClient;

  /// Detect objects in image file
  /// Returns a DetectionResult with detected objects and metadata
  Future<DetectionResult> detectObjects(File imageFile) async {
    try {
      // Prepare multipart form data with image file
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
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
        throw Exception(
          'Detection API returned status code: ${response.statusCode}',
        );
      }

      final data = response.data;
      if (data == null) {
        return DetectionResult(
          detections: [],
          detector: 'unknown',
          classifier: 'unknown',
          processingTimeMs: 0,
        );
      }

      // Parse detections from response
      final detectionsJson = data['detections'] as List<dynamic>?;
      final detections = detectionsJson
              ?.map(
                (d) => DetectedObject.fromJson(d as Map<String, dynamic>),
              )
              .toList() ??
          [];

      // Parse metadata
      final detector = data['detector'] as String? ?? 'unknown';
      final classifier = data['classifier'] as String? ?? 'unknown';
      final processingTimeMs = data['processingTimeMs'] as int? ?? 0;
      final corroborationCount = data['corroborationCount'] as int?;

      return DetectionResult(
        detections: detections,
        detector: detector,
        classifier: classifier,
        processingTimeMs: processingTimeMs,
        corroborationCount: corroborationCount,
      );
    } catch (e) {
      rethrow;
    }
  }
}
