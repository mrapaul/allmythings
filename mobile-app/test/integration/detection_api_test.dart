// Integration test that hits the real API with a fixture image and validates
// that `DetectionRepository.detectObjects()` can parse the response the same
// way the mobile app does. Run with:
//   flutter test test/integration/detection_api_test.dart
//
// This catches shape mismatches between server responses and
// `DetectedObject.fromJson` without needing to rebuild+redeploy to the device.

import 'dart:io';

import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const baseUrl = 'http://localhost:14000';
  const fixturePath = 'test/integration/fixture.jpg';

  test('API returns parseable detections for fixture image', () async {
    final fixture = File(fixturePath);
    expect(fixture.existsSync(), true, reason: 'Fixture image missing');

    // Build a repository that points at the local API.
    final apiClient = ApiClient();
    apiClient.dio.options.baseUrl = baseUrl;
    apiClient.dio.options.receiveTimeout = const Duration(seconds: 120);
    apiClient.dio.options.connectTimeout = const Duration(seconds: 120);
    final repo = DetectionRepository(apiClient);

    final result = await repo.detectObjects(fixture);

    // Print everything so we can see what came back
    // ignore: avoid_print
    print('=== RESULT ===');
    // ignore: avoid_print
    print('detector: ${result.detector}');
    // ignore: avoid_print
    print('classifier: ${result.classifier}');
    // ignore: avoid_print
    print('processingTimeMs: ${result.processingTimeMs}');
    // ignore: avoid_print
    print('detections: ${result.detections.length}');
    for (final d in result.detections) {
      // ignore: avoid_print
      print('  - ${d.label} [${d.category}] bbox=${d.boundingBox.x.toStringAsFixed(2)},${d.boundingBox.y.toStringAsFixed(2)} '
          '${d.boundingBox.width.toStringAsFixed(2)}x${d.boundingBox.height.toStringAsFixed(2)} '
          'conf=${d.confidence.toStringAsFixed(2)} colors=${d.colors} materials=${d.materials}');
    }

    expect(result.detections.length, greaterThan(0),
        reason: 'API returned empty detection list');

    // Every bbox must be normalized 0-1.
    for (final d in result.detections) {
      expect(d.boundingBox.x, inInclusiveRange(0, 1), reason: 'x out of range');
      expect(d.boundingBox.y, inInclusiveRange(0, 1), reason: 'y out of range');
      expect(d.boundingBox.width, inInclusiveRange(0, 1),
          reason: 'width out of range');
      expect(d.boundingBox.height, inInclusiveRange(0, 1),
          reason: 'height out of range');
    }
  }, timeout: const Timeout(Duration(seconds: 180)));
}
