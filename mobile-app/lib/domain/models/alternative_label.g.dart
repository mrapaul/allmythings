// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alternative_label.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_AlternativeLabel _$AlternativeLabelFromJson(Map<String, dynamic> json) =>
    _AlternativeLabel(
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      provider: $enumDecode(_$VisionProviderEnumMap, json['provider']),
    );

Map<String, dynamic> _$AlternativeLabelToJson(_AlternativeLabel instance) =>
    <String, dynamic>{
      'label': instance.label,
      'confidence': instance.confidence,
      'provider': _$VisionProviderEnumMap[instance.provider]!,
    };

const _$VisionProviderEnumMap = {
  VisionProvider.meta: 'meta',
  VisionProvider.google: 'google',
  VisionProvider.aws: 'aws',
  VisionProvider.tensorflow: 'tensorflow',
};
