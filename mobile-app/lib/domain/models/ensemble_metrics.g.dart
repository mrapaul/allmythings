// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ensemble_metrics.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_EnsembleMetrics _$EnsembleMetricsFromJson(Map<String, dynamic> json) =>
    _EnsembleMetrics(
      providersUsed: (json['providersUsed'] as num).toInt(),
      averageConfidence: (json['averageConfidence'] as num).toDouble(),
      consensusRate: (json['consensusRate'] as num).toDouble(),
    );

Map<String, dynamic> _$EnsembleMetricsToJson(_EnsembleMetrics instance) =>
    <String, dynamic>{
      'providersUsed': instance.providersUsed,
      'averageConfidence': instance.averageConfidence,
      'consensusRate': instance.consensusRate,
    };
