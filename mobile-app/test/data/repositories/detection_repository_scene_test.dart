// detection_repository.detectScene — parses SceneObservation from the
// pipeline-service / Fastify edge and returns the typed result. Mirrors
// section-08 §7. We override Dio's HttpClientAdapter with a fake to
// avoid the network without pulling in a new dep.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this._respond);
  final Future<ResponseBody> Function(RequestOptions opts) _respond;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<dynamic>? cancelFuture,
  ) async {
    calls++;
    // Drain the body stream — Dio expects the adapter to consume it.
    if (requestStream != null) {
      await requestStream.fold<int>(0, (acc, chunk) => acc + chunk.length);
    }
    return _respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonResponse(int code, Map<String, dynamic> body,
    {Map<String, List<String>>? headers}) {
  final bytes = utf8.encode(jsonEncode(body));
  return ResponseBody.fromBytes(
    bytes,
    code,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
      ...?headers,
    },
  );
}

void main() {
  Future<File> tempImage(String name) async {
    final dir = Directory.systemTemp.createTempSync('detect-test-');
    final f = File(p.join(dir.path, name));
    await f.writeAsBytes(List<int>.filled(64, 1));
    return f;
  }

  group('DetectionRepository.detectScene', () {
    test('parses 200 SceneObservation response', () async {
      final apiClient = ApiClient();
      // Replace the default IOHttpClientAdapter with our fake.
      apiClient.dio.httpClientAdapter = _FakeAdapter(
        (opts) async => _jsonResponse(200, {
          'sceneId': 'scene-007',
          'runId': 'run-007',
          'frameIds': ['f0'],
          'detections': [
            {
              'id': 'd-1',
              'bbox': {'x': 0, 'y': 0, 'width': 100, 'height': 80},
              'primaryLabel': 'sofa',
              'alternateLabels': [],
              'vlmStructuredAttributes': <String, dynamic>{},
              'agreementScore': 2,
              'contributingSignals': [],
              'confidence': 0.7,
            },
          ],
          'agreementCoverage': 0.5,
          'agreementPrecision': 0.0,
          'selfDiagnosisTriggered': false,
          'rerunDepth': 0,
          'flagged': false,
          'processingMs': 450,
          'errors': [],
          'tileErrors': [],
        }),
      );
      final repo = DetectionRepository(apiClient);

      final f = await tempImage('sofa.jpg');
      final SceneObservation obs = await repo.detectScene(f);

      expect(obs.sceneId, 'scene-007');
      expect(obs.detections, hasLength(1));
      expect(obs.detections.first.primaryLabel, 'sofa');
      expect(obs.processingMs, 450);
      // Default adapter must have been replaced.
      expect(apiClient.dio.httpClientAdapter, isA<_FakeAdapter>());
      // Restore so other tests don't see the fake.
      apiClient.dio.httpClientAdapter = IOHttpClientAdapter();
    });

    test('503 → retry → 200 surfaces the eventual result', () async {
      final apiClient = ApiClient();
      var calls = 0;
      apiClient.dio.httpClientAdapter = _FakeAdapter(
        (opts) async {
          calls++;
          if (calls == 1) {
            return _jsonResponse(503, {'error': 'pipeline_unavailable'});
          }
          return _jsonResponse(200, _minimalScene('scene-after-retry'));
        },
      );
      final repo = DetectionRepository(apiClient);

      final f = await tempImage('a.jpg');
      final obs = await repo.detectScene(f);
      expect(obs.sceneId, 'scene-after-retry');
      expect(calls, greaterThanOrEqualTo(2));
      apiClient.dio.httpClientAdapter = IOHttpClientAdapter();
    });

    test('non-retryable 400 surfaces error', () async {
      final apiClient = ApiClient();
      apiClient.dio.httpClientAdapter = _FakeAdapter(
        (opts) async => _jsonResponse(400, {'error': 'bad_request'}),
      );
      final repo = DetectionRepository(apiClient);

      final f = await tempImage('x.jpg');
      await expectLater(repo.detectScene(f), throwsA(isA<DioException>()));
      apiClient.dio.httpClientAdapter = IOHttpClientAdapter();
    });
  });
}

Map<String, dynamic> _minimalScene(String id) => <String, dynamic>{
      'sceneId': id,
      'runId': 'r',
      'frameIds': <String>[],
      'detections': <Map<String, dynamic>>[],
      'agreementCoverage': 0.0,
      'agreementPrecision': 0.0,
      'selfDiagnosisTriggered': false,
      'rerunDepth': 0,
      'flagged': false,
      'processingMs': 0,
      'errors': <Map<String, dynamic>>[],
      'tileErrors': <Map<String, dynamic>>[],
    };
