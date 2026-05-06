import 'dart:io';

import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/detection/detection_api.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';

/// Detection backed by the in-house `api-service` (Fastify + Temporal +
/// Florence/Qwen ensemble). Inherits the repository's 429/503 retry and
/// 202-poll resilience untouched — this class is just a thin façade that
/// hides DetectionRepository from the application layer so the UI can
/// remain transport-agnostic.
class ApiServiceDetectionApi implements DetectionApi {
  ApiServiceDetectionApi(this._repository);
  final DetectionRepository _repository;

  @override
  Future<SceneObservation> detectScene(File imageFile) {
    return _repository.detectScene(imageFile);
  }

  @override
  Future<SceneObservation> detectSceneBurst(List<File> frames) {
    return _repository.detectSceneBurst(frames);
  }
}
