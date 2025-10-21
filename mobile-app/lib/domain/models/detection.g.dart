// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detection.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$DetectionImpl _$$DetectionImplFromJson(Map<String, dynamic> json) =>
    _$DetectionImpl(
      id: json['id'] as String,
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      boundingBox:
          BoundingBox.fromJson(json['boundingBox'] as Map<String, dynamic>),
      ensembleDetails: EnsembleDetails.fromJson(
          json['ensembleDetails'] as Map<String, dynamic>),
      alternativeLabels: (json['alternativeLabels'] as List<dynamic>)
          .map((e) => AlternativeLabel.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$DetectionImplToJson(_$DetectionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'confidence': instance.confidence,
      'boundingBox': instance.boundingBox,
      'ensembleDetails': instance.ensembleDetails,
      'alternativeLabels': instance.alternativeLabels,
    };
