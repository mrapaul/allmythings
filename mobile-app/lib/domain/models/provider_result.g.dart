// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'provider_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ProviderResultImpl _$$ProviderResultImplFromJson(Map<String, dynamic> json) =>
    _$ProviderResultImpl(
      provider: $enumDecode(_$VisionProviderEnumMap, json['provider']),
      success: json['success'] as bool,
      processingTimeMs: (json['processingTimeMs'] as num).toInt(),
      detections: (json['detections'] as List<dynamic>)
          .map((e) => Detection.fromJson(e as Map<String, dynamic>))
          .toList(),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$$ProviderResultImplToJson(
        _$ProviderResultImpl instance) =>
    <String, dynamic>{
      'provider': _$VisionProviderEnumMap[instance.provider]!,
      'success': instance.success,
      'processingTimeMs': instance.processingTimeMs,
      'detections': instance.detections,
      'error': instance.error,
    };

const _$VisionProviderEnumMap = {
  VisionProvider.meta: 'meta',
  VisionProvider.google: 'google',
  VisionProvider.aws: 'aws',
  VisionProvider.tensorflow: 'tensorflow',
};
