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
    this.photoId,
    this.photoUrl,
    this.traceId,
  });
  final List<DetectedObject> detections;
  final String detector;
  final String classifier;
  final int processingTimeMs;
  final int? corroborationCount;
  final String? photoId;
  final String? photoUrl;
  final String? traceId;
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

      // Call detection API endpoint in blocking mode (single JSON response)
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/v1/detect',
        data: formData,
        queryParameters: {'mode': 'full'},
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

      // Florence pipeline response shape: { photoId, photoUrl, itemCount, items, errors, traceId, processingMs, imageQuality }
      final items = data['items'] as List<dynamic>?;
      final detections = items
              ?.map((d) => DetectedObject.fromApiItem(d as Map<String, dynamic>))
              .toList() ??
          [];

      final photoId = data['photoId'] as String?;
      final photoUrl = data['photoUrl'] as String?;
      final traceId = data['traceId'] as String?;
      final processingTimeMs = (data['processingMs'] as num?)?.toInt() ?? 0;

      return DetectionResult(
        detections: detections,
        detector: 'florence-2',
        classifier: 'qwen2.5vl',
        processingTimeMs: processingTimeMs,
        photoId: photoId,
        photoUrl: photoUrl,
        traceId: traceId,
      );
    } catch (e) {
      rethrow;
    }
  }
}
