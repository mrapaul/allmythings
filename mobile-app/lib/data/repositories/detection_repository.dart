import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:logging/logging.dart';

final _log = Logger('DetectionRepository');

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
    // Pre-read bytes once. iOS can invalidate the file descriptor on a
    // long-lived `MultipartFile.fromFile` stream (memory pressure / app
    // lifecycle), surfacing as DioException "Bad file descriptor" mid-upload.
    // Holding the JPEG in memory (~2-5MB) is cheap; reusing bytes across
    // retries is also more deterministic than re-streaming.
    final bytes = await imageFile.readAsBytes();
    final filename = imageFile.path.split('/').last;
    Response<dynamic>? response;
    var attempt = 0;
    while (true) {
      attempt++;
      try {
        final formData = FormData.fromMap({
          'file': MultipartFile.fromBytes(bytes, filename: filename),
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

  /// Section-08 §7: parse the new SceneObservation contract.
  ///
  /// Same multipart POST + 429/503 retry + 202+poll semantics as
  /// [detectObjects], but the response body is parsed as a
  /// [SceneObservation] (the wire shape pipeline-service actually emits
  /// when ``usePipelineService`` is enabled in Fastify).
  Future<SceneObservation> detectScene(File imageFile) async {
    final body = await _postSingleFrame(imageFile);
    return SceneObservation.fromJson(body);
  }

  /// Section-08 §9.1: 3-frame burst upload. Sends 1-3 multipart parts
  /// (each with field name "photo"), with the idempotency key in the
  /// "Idempotency-Key" header. Server-side formula at
  /// api-service/src/routes/detect.route.ts must match exactly:
  ///
  ///   sha256( sha256(frame0).bytes ‖ sha256(frame1).bytes ‖ sha256(frame2).bytes )
  ///
  /// A divergence silently breaks idempotent retries on the server side
  /// — the unit test in detection_repository_burst_test.dart pins the
  /// formula against the canonical Fastify implementation.
  Future<SceneObservation> detectSceneBurst(List<File> frames) async {
    if (frames.isEmpty) {
      throw ArgumentError('detectSceneBurst requires at least 1 frame');
    }
    if (frames.length > 3) {
      throw ArgumentError(
        'detectSceneBurst requires 1-3 frames; got ${frames.length}',
      );
    }

    // Pre-read each frame so we can hash before uploading.
    final perFrameHashes = <Uint8List>[];
    final multipartFiles = <MultipartFile>[];
    for (var i = 0; i < frames.length; i++) {
      final bytes = await frames[i].readAsBytes();
      perFrameHashes.add(Uint8List.fromList(sha256.convert(bytes).bytes));
      final filename =
          'frame-$i${_extFromPath(frames[i].path) ?? '.jpg'}';
      multipartFiles.add(
        MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: DioMediaType.parse(_mimeFromPath(frames[i].path)),
        ),
      );
    }

    final concat = <int>[];
    for (final h in perFrameHashes) {
      concat.addAll(h);
    }
    final idempotencyKey = sha256.convert(concat).toString();
    final totalBytes =
        multipartFiles.fold<int>(0, (acc, m) => acc + m.length);
    _log.info(
      'burst upload: frames=${frames.length} bytes=$totalBytes '
      'idempotency=${idempotencyKey.substring(0, 12)}…',
    );

    Response<dynamic>? response;
    var attempt = 0;
    while (true) {
      attempt++;
      try {
        // FormData re-evaluates files on each attempt so the upload
        // body is freshly built — Dio doesn't rewind file streams.
        // For burst we want to retry deterministically with the same
        // bytes, so we rebuild the FormData per attempt.
        final formData = FormData();
        for (final f in multipartFiles) {
          formData.files.add(MapEntry('photo', f.clone()));
        }
        response = await _apiClient.dio.post<Map<String, dynamic>>(
          '/v1/detect',
          data: formData,
          queryParameters: const {'mode': 'full'},
          options: Options(
            contentType: 'multipart/form-data',
            headers: {'Idempotency-Key': idempotencyKey},
            validateStatus: (code) => code != null && code < 400,
          ),
        );
        break;
      } on DioException catch (e) {
        final code = e.response?.statusCode;
        if ((code == 429 || code == 503) && attempt < _maxRetryAttempts) {
          final backoffMs = 1000 * attempt * attempt; // 1s, 4s, 9s
          debugPrint(
            '[DETECT-BURST] /v1/detect $code; retry $attempt/$_maxRetryAttempts in ${backoffMs}ms',
          );
          await Future<void>.delayed(Duration(milliseconds: backoffMs));
          continue;
        }
        rethrow;
      }
    }

    final statusCode = response.statusCode ?? 0;
    final data = response.data;
    if (statusCode == 202) {
      final accepted = _asMap(data);
      final workflowId = (accepted['workflowId'] as String?) ??
          (accepted['runId'] as String?);
      if (workflowId == null || workflowId.isEmpty) {
        throw Exception(
          'Detection API returned 202 without workflowId/runId: $accepted',
        );
      }
      final body = await _pollSceneStatus(workflowId);
      return SceneObservation.fromJson(body);
    }
    if (statusCode != 200) {
      throw Exception('Detection API returned status code: $statusCode');
    }
    return SceneObservation.fromJson(_asMap(data));
  }

  String? _extFromPath(String path) {
    final i = path.lastIndexOf('.');
    if (i < 0 || i == path.length - 1) return null;
    return path.substring(i).toLowerCase();
  }

  String _mimeFromPath(String path) {
    final ext = _extFromPath(path) ?? '.jpg';
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  /// Shared multipart POST + retry + 202-poll for scene endpoints.
  /// Returns the response body as a Map (caller decides which type to
  /// instantiate). Lifted from [detectObjects] so the new
  /// SceneObservation path inherits identical resilience behaviour.
  Future<Map<String, dynamic>> _postSingleFrame(File imageFile) async {
    // See note in detectObjects: streaming from a File FD is fragile on iOS
    // (EBADF mid-upload). Pre-read bytes; reuse across retries.
    final bytes = await imageFile.readAsBytes();
    final filename = imageFile.path.split('/').last;
    Response<dynamic>? response;
    var attempt = 0;
    while (true) {
      attempt++;
      try {
        final formData = FormData.fromMap({
          'file': MultipartFile.fromBytes(bytes, filename: filename),
        });
        response = await _apiClient.dio.post<Map<String, dynamic>>(
          '/v1/detect',
          data: formData,
          queryParameters: {'mode': 'full'},
          options: Options(
            contentType: 'multipart/form-data',
            validateStatus: (code) => code != null && code < 400,
          ),
        );
        break;
      } on DioException catch (e) {
        final code = e.response?.statusCode;
        if ((code == 429 || code == 503) && attempt < _maxRetryAttempts) {
          final backoffMs = 1000 * attempt * attempt;
          debugPrint(
            '[DETECT] /v1/detect returned $code; retry $attempt/$_maxRetryAttempts in ${backoffMs}ms',
          );
          await Future<void>.delayed(Duration(milliseconds: backoffMs));
          continue;
        }
        rethrow;
      }
    }

    final statusCode = response.statusCode ?? 0;
    final data = response.data;
    if (statusCode == 202) {
      // Workflow accepted — poll status. Returns the raw result map so the
      // caller can decide which type to parse.
      final acceptedBody = _asMap(data);
      final workflowId = (acceptedBody['workflowId'] as String?) ??
          (acceptedBody['runId'] as String?);
      if (workflowId == null || workflowId.isEmpty) {
        throw Exception(
          'Detection API returned 202 without workflowId/runId: $acceptedBody',
        );
      }
      return _pollSceneStatus(workflowId);
    }
    if (statusCode != 200) {
      throw Exception('Detection API returned status code: $statusCode');
    }
    return _asMap(data);
  }

  /// Poll `/v1/detect/status/:workflowId` for a SceneObservation result.
  /// Mirrors [_pollDetectionStatus] but unwraps the result without
  /// running it through the legacy parser.
  Future<Map<String, dynamic>> _pollSceneStatus(String workflowId) async {
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

        if (code == 200 &&
            (status == 'completed' || status == 'succeeded')) {
          final result = body['result'];
          if (result is! Map) {
            throw Exception(
              'Workflow $workflowId completed but result missing: $body',
            );
          }
          return Map<String, dynamic>.from(result);
        }
        if (code >= 500) {
          throw Exception(
            'Workflow $workflowId failed: ${status ?? 'unknown'}',
          );
        }
        if (code == 404) {
          throw Exception('Workflow $workflowId not found');
        }
      } on DioException catch (e) {
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
}
