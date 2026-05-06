// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scene_observation.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_BBox _$BBoxFromJson(Map<String, dynamic> json) => _BBox(
  x: (json['x'] as num).toDouble(),
  y: (json['y'] as num).toDouble(),
  width: (json['width'] as num).toDouble(),
  height: (json['height'] as num).toDouble(),
);

Map<String, dynamic> _$BBoxToJson(_BBox instance) => <String, dynamic>{
  'x': instance.x,
  'y': instance.y,
  'width': instance.width,
  'height': instance.height,
};

_ContributingSignal _$ContributingSignalFromJson(Map<String, dynamic> json) =>
    _ContributingSignal(
      detector: json['detector'] as String,
      frameId: json['frameId'] as String,
      rawConfidence: (json['rawConfidence'] as num?)?.toDouble(),
    );

Map<String, dynamic> _$ContributingSignalToJson(_ContributingSignal instance) =>
    <String, dynamic>{
      'detector': instance.detector,
      'frameId': instance.frameId,
      'rawConfidence': instance.rawConfidence,
    };

_AlternateLabel _$AlternateLabelFromJson(Map<String, dynamic> json) =>
    _AlternateLabel(
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
    );

Map<String, dynamic> _$AlternateLabelToJson(_AlternateLabel instance) =>
    <String, dynamic>{
      'label': instance.label,
      'confidence': instance.confidence,
    };

_OpError _$OpErrorFromJson(Map<String, dynamic> json) => _OpError(
  op: json['op'] as String,
  code: json['code'] as String,
  message: json['message'] as String,
);

Map<String, dynamic> _$OpErrorToJson(_OpError instance) => <String, dynamic>{
  'op': instance.op,
  'code': instance.code,
  'message': instance.message,
};

_TileError _$TileErrorFromJson(Map<String, dynamic> json) => _TileError(
  tileIndex: (json['tileIndex'] as num).toInt(),
  code: json['code'] as String,
  message: json['message'] as String,
);

Map<String, dynamic> _$TileErrorToJson(_TileError instance) =>
    <String, dynamic>{
      'tileIndex': instance.tileIndex,
      'code': instance.code,
      'message': instance.message,
    };

_PipelineDetection _$PipelineDetectionFromJson(Map<String, dynamic> json) =>
    _PipelineDetection(
      id: json['id'] as String,
      bbox: BBox.fromJson(json['bbox'] as Map<String, dynamic>),
      maskRleB64: json['maskRleB64'] as String?,
      cropEmbeddingB64: json['cropEmbeddingB64'] as String?,
      primaryLabel: json['primaryLabel'] as String,
      alternateLabels:
          (json['alternateLabels'] as List<dynamic>?)
              ?.map((e) => AlternateLabel.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <AlternateLabel>[],
      vlmStructuredAttributes:
          json['vlmStructuredAttributes'] as Map<String, dynamic>? ??
          const <String, dynamic>{},
      agreementScore: (json['agreementScore'] as num?)?.toDouble() ?? 0.0,
      contributingSignals:
          (json['contributingSignals'] as List<dynamic>?)
              ?.map(
                (e) => ContributingSignal.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const <ContributingSignal>[],
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0.0,
    );

Map<String, dynamic> _$PipelineDetectionToJson(_PipelineDetection instance) =>
    <String, dynamic>{
      'id': instance.id,
      'bbox': instance.bbox,
      'maskRleB64': instance.maskRleB64,
      'cropEmbeddingB64': instance.cropEmbeddingB64,
      'primaryLabel': instance.primaryLabel,
      'alternateLabels': instance.alternateLabels,
      'vlmStructuredAttributes': instance.vlmStructuredAttributes,
      'agreementScore': instance.agreementScore,
      'contributingSignals': instance.contributingSignals,
      'confidence': instance.confidence,
    };

_SceneObservation _$SceneObservationFromJson(
  Map<String, dynamic> json,
) => _SceneObservation(
  sceneId: json['sceneId'] as String,
  runId: json['runId'] as String,
  frameIds:
      (json['frameIds'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const <String>[],
  detections:
      (json['detections'] as List<dynamic>?)
          ?.map((e) => PipelineDetection.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <PipelineDetection>[],
  agreementCoverage: (json['agreementCoverage'] as num?)?.toDouble() ?? 0.0,
  agreementPrecision: (json['agreementPrecision'] as num?)?.toDouble() ?? 0.0,
  selfDiagnosisTriggered: json['selfDiagnosisTriggered'] as bool? ?? false,
  rerunDepth: (json['rerunDepth'] as num?)?.toInt() ?? 0,
  flagged: json['flagged'] as bool? ?? false,
  flagReason: json['flagReason'] as String?,
  processingMs: (json['processingMs'] as num?)?.toInt() ?? 0,
  errors:
      (json['errors'] as List<dynamic>?)
          ?.map((e) => OpError.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <OpError>[],
  tileErrors:
      (json['tileErrors'] as List<dynamic>?)
          ?.map((e) => TileError.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const <TileError>[],
);

Map<String, dynamic> _$SceneObservationToJson(_SceneObservation instance) =>
    <String, dynamic>{
      'sceneId': instance.sceneId,
      'runId': instance.runId,
      'frameIds': instance.frameIds,
      'detections': instance.detections,
      'agreementCoverage': instance.agreementCoverage,
      'agreementPrecision': instance.agreementPrecision,
      'selfDiagnosisTriggered': instance.selfDiagnosisTriggered,
      'rerunDepth': instance.rerunDepth,
      'flagged': instance.flagged,
      'flagReason': instance.flagReason,
      'processingMs': instance.processingMs,
      'errors': instance.errors,
      'tileErrors': instance.tileErrors,
    };
