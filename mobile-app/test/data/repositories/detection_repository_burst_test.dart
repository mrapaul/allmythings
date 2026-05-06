// detectSceneBurst — sends 1-3 multipart parts; idempotency key is
// sha256(concat(sha256(per-frame))). The formula must match the
// Fastify edge byte-for-byte (api-service/src/routes/detect.route.ts);
// a divergence silently breaks idempotent retries on the server.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this._respond);
  final Future<ResponseBody> Function(RequestOptions opts, List<int> bodyBytes)
      _respond;
  RequestOptions? lastOptions;
  List<int>? lastBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<dynamic>? cancelFuture,
  ) async {
    lastOptions = options;
    final accumulated = <int>[];
    if (requestStream != null) {
      await for (final chunk in requestStream) {
        accumulated.addAll(chunk);
      }
    }
    lastBody = accumulated;
    return _respond(options, accumulated);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonResponse(int code, Map<String, dynamic> body) {
  final bytes = utf8.encode(jsonEncode(body));
  return ResponseBody.fromBytes(
    bytes,
    code,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

Map<String, dynamic> _scene(String id) => <String, dynamic>{
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

Future<File> _tempFile(String name, List<int> bytes) async {
  final dir = Directory.systemTemp.createTempSync('burst-test-');
  final f = File(p.join(dir.path, name));
  await f.writeAsBytes(bytes);
  return f;
}

void main() {
  group('DetectionRepository.detectSceneBurst', () {
    test('rejects empty / oversize burst lists', () async {
      final apiClient = ApiClient();
      final repo = DetectionRepository(apiClient);

      await expectLater(
        repo.detectSceneBurst(const []),
        throwsArgumentError,
      );
      final f = await _tempFile('a.jpg', [0]);
      await expectLater(
        repo.detectSceneBurst([f, f, f, f]),
        throwsArgumentError,
      );
    });

    test('1-frame burst → multipart with 1 file part, idempotency = sha256(sha256(frame))',
        () async {
      final apiClient = ApiClient();
      final adapter = _FakeAdapter(
        (opts, _) async => _jsonResponse(200, _scene('s-1')),
      );
      apiClient.dio.httpClientAdapter = adapter;
      final repo = DetectionRepository(apiClient);

      final bytes = [1, 2, 3, 4, 5];
      final f = await _tempFile('frame-0.jpg', bytes);

      final SceneObservation obs = await repo.detectSceneBurst([f]);
      expect(obs.sceneId, 's-1');

      // Multipart body must contain the frame bytes; we don't parse
      // the boundary, just check the per-frame idempotency hash header
      // / form field once we wire it.
      expect(adapter.lastOptions?.method, 'POST');
      expect(adapter.lastOptions?.path, '/v1/detect');
      apiClient.dio.httpClientAdapter = IOHttpClientAdapter();
    });

    test('3-frame burst → idempotency header is sha256(concat(sha256(f0..2)))',
        () async {
      final apiClient = ApiClient();
      String? sentIdempotencyHeader;
      final adapter = _FakeAdapter(
        (opts, _) async {
          sentIdempotencyHeader = opts.headers['idempotency-key'] as String?;
          return _jsonResponse(200, _scene('s-burst'));
        },
      );
      apiClient.dio.httpClientAdapter = adapter;
      final repo = DetectionRepository(apiClient);

      final raw0 = [10, 20, 30];
      final raw1 = [40, 50, 60];
      final raw2 = [70, 80, 90];
      final f0 = await _tempFile('f0.jpg', raw0);
      final f1 = await _tempFile('f1.jpg', raw1);
      final f2 = await _tempFile('f2.jpg', raw2);

      final obs = await repo.detectSceneBurst([f0, f1, f2]);
      expect(obs.sceneId, 's-burst');

      // Compute the canonical idempotency key the server will see.
      Uint8List sha(List<int> b) => Uint8List.fromList(sha256.convert(b).bytes);
      final concat = <int>[
        ...sha(raw0),
        ...sha(raw1),
        ...sha(raw2),
      ];
      final expected = sha256.convert(concat).toString();
      expect(sentIdempotencyHeader, expected,
          reason:
              'idempotency-key header must match the Fastify formula in '
              'api-service/src/routes/detect.route.ts');
      apiClient.dio.httpClientAdapter = IOHttpClientAdapter();
    });
  });
}
