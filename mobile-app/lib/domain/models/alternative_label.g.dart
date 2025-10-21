// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'alternative_label.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$AlternativeLabelImpl _$$AlternativeLabelImplFromJson(
        Map<String, dynamic> json) =>
    _$AlternativeLabelImpl(
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      provider: $enumDecode(_$VisionProviderEnumMap, json['provider']),
    );

Map<String, dynamic> _$$AlternativeLabelImplToJson(
        _$AlternativeLabelImpl instance) =>
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
