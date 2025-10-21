// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ensemble_metrics.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$EnsembleMetricsImpl _$$EnsembleMetricsImplFromJson(
        Map<String, dynamic> json) =>
    _$EnsembleMetricsImpl(
      providersUsed: (json['providersUsed'] as num).toInt(),
      averageConfidence: (json['averageConfidence'] as num).toDouble(),
      consensusRate: (json['consensusRate'] as num).toDouble(),
    );

Map<String, dynamic> _$$EnsembleMetricsImplToJson(
        _$EnsembleMetricsImpl instance) =>
    <String, dynamic>{
      'providersUsed': instance.providersUsed,
      'averageConfidence': instance.averageConfidence,
      'consensusRate': instance.consensusRate,
    };
