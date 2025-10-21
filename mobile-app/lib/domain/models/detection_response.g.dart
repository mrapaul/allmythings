// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detection_response.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$DetectionResponseImpl _$$DetectionResponseImplFromJson(
        Map<String, dynamic> json) =>
    _$DetectionResponseImpl(
      success: json['success'] as bool,
      ensembleMode: json['ensembleMode'] as String,
      processingTimeMs: (json['processingTimeMs'] as num).toInt(),
      detections: (json['detections'] as List<dynamic>)
          .map((e) => Detection.fromJson(e as Map<String, dynamic>))
          .toList(),
      providerResults: (json['providerResults'] as List<dynamic>)
          .map((e) => ProviderResult.fromJson(e as Map<String, dynamic>))
          .toList(),
      ensembleMetrics: EnsembleMetrics.fromJson(
          json['ensembleMetrics'] as Map<String, dynamic>),
      error: json['error'] as String?,
    );

Map<String, dynamic> _$$DetectionResponseImplToJson(
        _$DetectionResponseImpl instance) =>
    <String, dynamic>{
      'success': instance.success,
      'ensembleMode': instance.ensembleMode,
      'processingTimeMs': instance.processingTimeMs,
      'detections': instance.detections,
      'providerResults': instance.providerResults,
      'ensembleMetrics': instance.ensembleMetrics,
      'error': instance.error,
    };
