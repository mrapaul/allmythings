import 'dart:io';

import 'package:all_my_things/domain/models/scene_observation.dart';

/// UI-facing detection abstraction.
///
/// The presentation layer never reaches into the api-service repository or
/// any specific transport — it only depends on this contract. Concrete
/// implementations can swap freely (HTTP/Florence ensemble, Gemini-direct,
/// on-device CoreML, fakes for tests) without touching screens or
/// providers above this seam.
abstract class DetectionApi {
  /// Single-frame scene detection. Returns a fully-resolved
  /// [SceneObservation] (the impl is responsible for any retry / status
  /// polling / 202-acceptance gymnastics).
  Future<SceneObservation> detectScene(File imageFile);

  /// Multi-frame burst (1–3 frames). Implementations should treat this as
  /// idempotent on the burst contents. Returns the fused observation.
  Future<SceneObservation> detectSceneBurst(List<File> frames);
}
