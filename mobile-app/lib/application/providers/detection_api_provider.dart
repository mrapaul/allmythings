import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/data/detection/api_service_detection_api.dart';
import 'package:all_my_things/domain/detection/detection_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Single seam through which the application layer reaches detection.
///
/// Default implementation is [ApiServiceDetectionApi] (HTTP → in-house
/// Fastify api-service). Override in tests or when ship-swapping to a
/// different detection backend (Gemini-direct, on-device, etc.) — no
/// change to screens or notifiers required.
final detectionApiProvider = Provider<DetectionApi>((ref) {
  final repository = ref.watch(detectionRepositoryProvider);
  return ApiServiceDetectionApi(repository);
});
