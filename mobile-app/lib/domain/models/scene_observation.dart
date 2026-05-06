// SceneObservation domain model — wire shape mirrors §5.1 of the plan
// (api-service/src/types/pipeline.ts and pipeline-service/pipeline_service/types.py).
//
// Generated parts: scene_observation.freezed.dart, scene_observation.g.dart.
// Run: flutter pub run build_runner build --delete-conflicting-outputs
import 'package:freezed_annotation/freezed_annotation.dart';

part 'scene_observation.freezed.dart';
part 'scene_observation.g.dart';

/// Bounding box in source-frame pixels.
@freezed
abstract class BBox with _$BBox {
  const factory BBox({
    required double x,
    required double y,
    required double width,
    required double height,
  }) = _BBox;

  factory BBox.fromJson(Map<String, dynamic> json) => _$BBoxFromJson(json);
}

/// One detector's vote for a detection: maps detector class + frame to a
/// raw confidence (nullable when the detector does not expose calibrated
/// scores, e.g., gdino-sahi rerun).
@freezed
abstract class ContributingSignal with _$ContributingSignal {
  const factory ContributingSignal({
    required String detector,        // 'florence' | 'gdino' | 'gdino-sahi'
    required String frameId,
    double? rawConfidence,
  }) = _ContributingSignal;

  factory ContributingSignal.fromJson(Map<String, dynamic> json) =>
      _$ContributingSignalFromJson(json);
}

/// One alternate label proposed by classification_refine; the primary label
/// lives on PipelineDetection.primaryLabel.
@freezed
abstract class AlternateLabel with _$AlternateLabel {
  const factory AlternateLabel({
    required String label,
    required double confidence,
  }) = _AlternateLabel;

  factory AlternateLabel.fromJson(Map<String, dynamic> json) =>
      _$AlternateLabelFromJson(json);
}

/// One operator-level error (op + code + message). Surfaced when a §3.x
/// op fails or assemble_result has to fall back to its empty-observation
/// path.
@freezed
abstract class OpError with _$OpError {
  const factory OpError({
    required String op,
    required String code,
    required String message,
  }) = _OpError;

  factory OpError.fromJson(Map<String, dynamic> json) =>
      _$OpErrorFromJson(json);
}

/// Per-tile sahi_recovery error.
@freezed
abstract class TileError with _$TileError {
  const factory TileError({
    required int tileIndex,
    required String code,
    required String message,
  }) = _TileError;

  factory TileError.fromJson(Map<String, dynamic> json) =>
      _$TileErrorFromJson(json);
}

/// One dedup'd object instance in a scene. Mirrors §5.1's PipelineDetection.
@freezed
abstract class PipelineDetection with _$PipelineDetection {
  const factory PipelineDetection({
    required String id,
    required BBox bbox,
    String? maskRleB64,
    String? cropEmbeddingB64,
    required String primaryLabel,
    @Default(<AlternateLabel>[]) List<AlternateLabel> alternateLabels,
    /// May legitimately be {} when classification_refine cascades through
    /// every VLM tier without producing attributes — item_detail must
    /// render this without crashing (see scene_observation_test).
    @Default(<String, dynamic>{}) Map<String, dynamic> vlmStructuredAttributes,
    @Default(0.0) double agreementScore,
    @Default(<ContributingSignal>[]) List<ContributingSignal> contributingSignals,
    @Default(0.0) double confidence,
  }) = _PipelineDetection;

  factory PipelineDetection.fromJson(Map<String, dynamic> json) =>
      _$PipelineDetectionFromJson(json);
}

/// The scene-level result the Mac pipeline-service ships through Fastify.
@freezed
abstract class SceneObservation with _$SceneObservation {
  const factory SceneObservation({
    required String sceneId,
    required String runId,
    @Default(<String>[]) List<String> frameIds,
    @Default(<PipelineDetection>[]) List<PipelineDetection> detections,
    @Default(0.0) double agreementCoverage,
    @Default(0.0) double agreementPrecision,
    @Default(false) bool selfDiagnosisTriggered,
    @Default(0) int rerunDepth,
    @Default(false) bool flagged,
    String? flagReason,
    @Default(0) int processingMs,
    @Default(<OpError>[]) List<OpError> errors,
    @Default(<TileError>[]) List<TileError> tileErrors,
  }) = _SceneObservation;

  factory SceneObservation.fromJson(Map<String, dynamic> json) =>
      _$SceneObservationFromJson(json);
}
