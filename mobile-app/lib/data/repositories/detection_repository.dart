import 'dart:async';
import 'dart:io';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;

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
///
/// Resilience behaviour:
/// - 429 / 503 responses are retried up to 3 attempts with exponential
///   backoff (1s, 4s, 9s) before surfacing the error to the caller.
/// - 202 responses are treated as accepted-but-pending: the body's
///   `workflowId` is polled via `GET /v1/detect/status/:workflowId` every
///   2s for up to 60s. The completed result is returned seamlessly to
///   the caller, so `detectObjects()`'s return type is unchanged.
class DetectionRepository {
  DetectionRepository(this._apiClient);
  final ApiClient _apiClient;

  /// Maximum retry attempts for transient (429/503) responses.
  static const int _maxRetryAttempts = 3;

  /// Maximum polling iterations for a 202 workflow (30 * 2s = 60s).
  static const int _maxPollAttempts = 30;

  /// Per-iteration polling interval.
  static const Duration _pollInterval = Duration(seconds: 2);

  /// Detect objects in image file.
  /// Returns a [DetectionResult] with detected objects and metadata.
  Future<DetectionResult> detectObjects(File imageFile) async {
    // Retry loop for 429/503. Dio surfaces those as DioException with a
    // response attached, so we catch and inspect `statusCode`.
    Response<dynamic>? response;
    var attempt = 0;
    while (true) {
      attempt++;
      try {
        final formData = FormData.fromMap({
          'file': await MultipartFile.fromFile(
            imageFile.path,
            filename: imageFile.path.split('/').last,
          ),
        });

        response = await _apiClient.dio.post<Map<String, dynamic>>(
          '/v1/detect',
          data: formData,
          queryParameters: {'mode': 'full'},
          options: Options(
            contentType: 'multipart/form-data',
            // Accept 202 alongside 200 so dio does not treat it as an error.
            validateStatus: (code) => code != null && code < 400,
          ),
        );
        break;
      } on DioException catch (e) {
        final code = e.response?.statusCode;
        if ((code == 429 || code == 503) && attempt < _maxRetryAttempts) {
          final backoffMs = 1000 * attempt * attempt; // 1s, 4s, 9s
          debugPrint(
            '[DETECT] /v1/detect returned $code; retry $attempt/$_maxRetryAttempts in ${backoffMs}ms',
          );
          await Future<void>.delayed(Duration(milliseconds: backoffMs));
          continue;
        }
        // Non-retryable, or out of retries — bubble up.
        rethrow;
      }
    }

    final statusCode = response.statusCode ?? 0;
    final data = response.data;

    if (statusCode == 202) {
      // Workflow accepted but still running — poll for completion.
      final body = _asMap(data);
      final workflowId = body['workflowId'] as String?;
      if (workflowId == null || workflowId.isEmpty) {
        throw Exception(
          'Detection API returned 202 without workflowId: $body',
        );
      }
      debugPrint('[DETECT] 202 accepted, polling workflowId=$workflowId');
      return _pollDetectionStatus(workflowId);
    }

    if (statusCode != 200) {
      throw Exception(
        'Detection API returned status code: $statusCode',
      );
    }

    return _parseDetectionPayload(_asMap(data));
  }

  /// Poll `/v1/detect/status/:workflowId` every [_pollInterval] for up to
  /// [_maxPollAttempts] iterations (~60s total). Returns the completed
  /// DetectionResult or throws on terminal failure / timeout.
  Future<DetectionResult> _pollDetectionStatus(String workflowId) async {
    for (var i = 0; i < _maxPollAttempts; i++) {
      await Future<void>.delayed(_pollInterval);
      try {
        final res = await _apiClient.dio.get<Map<String, dynamic>>(
          '/v1/detect/status/$workflowId',
          options: Options(
            validateStatus: (code) => code != null && code < 600,
            receiveTimeout: const Duration(seconds: 10),
          ),
        );
        final code = res.statusCode ?? 0;
        final body = _asMap(res.data);
        final status = body['status'] as String?;

        if (code == 200 && status == 'completed') {
          final result = body['result'];
          if (result is! Map) {
            throw Exception(
              'Workflow $workflowId completed but result missing: $body',
            );
          }
          return _parseDetectionPayload(
            Map<String, dynamic>.from(result),
          );
        }
        if (code >= 500) {
          throw Exception(
            'Workflow $workflowId failed: ${status ?? 'unknown'}',
          );
        }
        if (code == 404) {
          throw Exception('Workflow $workflowId not found');
        }
        // 202 running, or anything else in flight — keep polling.
      } on DioException catch (e) {
        // Network hiccup during polling — log and continue. The overall
        // timeout below will surface persistent failures.
        debugPrint(
          '[DETECT] Polling $workflowId iteration $i hit ${e.message}; continuing',
        );
      }
    }
    throw Exception(
      'Workflow polling timeout after ${_maxPollAttempts * _pollInterval.inSeconds} seconds '
      '(workflowId=$workflowId)',
    );
  }

  /// Parse a Florence pipeline response body into [DetectionResult].
  ///
  /// Expected shape:
  ///   { photoId, photoUrl, itemCount, items, errors, traceId,
  ///     processingMs, imageQuality }
  DetectionResult _parseDetectionPayload(Map<String, dynamic> data) {
    final items = data['items'] as List<dynamic>?;
    final detections = items
            ?.map((d) => DetectedObject.fromApiItem(d as Map<String, dynamic>))
            .toList() ??
        <DetectedObject>[];

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
  }

  Map<String, dynamic> _asMap(dynamic data) {
    if (data == null) return <String, dynamic>{};
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    throw Exception('Unexpected response body type: ${data.runtimeType}');
  }
}
