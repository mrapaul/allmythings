// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detection.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Detection _$DetectionFromJson(Map<String, dynamic> json) => _Detection(
  label: json['label'] as String,
  confidence: (json['confidence'] as num).toDouble(),
  boundingBox: BoundingBox.fromJson(
    json['boundingBox'] as Map<String, dynamic>,
  ),
  ensembleDetails: EnsembleDetails.fromJson(
    json['ensembleDetails'] as Map<String, dynamic>,
  ),
  alternativeLabels: (json['alternativeLabels'] as List<dynamic>)
      .map((e) => AlternativeLabel.fromJson(e as Map<String, dynamic>))
      .toList(),
  id: json['id'] as String?,
  createdAt: json['createdAt'] == null
      ? null
      : DateTime.parse(json['createdAt'] as String),
  updatedAt: json['updatedAt'] == null
      ? null
      : DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$DetectionToJson(_Detection instance) =>
    <String, dynamic>{
      'label': instance.label,
      'confidence': instance.confidence,
      'boundingBox': instance.boundingBox.toJson(),
      'ensembleDetails': instance.ensembleDetails.toJson(),
      'alternativeLabels': instance.alternativeLabels
          .map((e) => e.toJson())
          .toList(),
      'id': instance.id,
      'createdAt': instance.createdAt?.toIso8601String(),
      'updatedAt': instance.updatedAt?.toIso8601String(),
    };
