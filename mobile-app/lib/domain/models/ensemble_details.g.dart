// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ensemble_details.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$EnsembleDetailsImpl _$$EnsembleDetailsImplFromJson(
        Map<String, dynamic> json) =>
    _$EnsembleDetailsImpl(
      providerAgreement: (json['providerAgreement'] as num).toInt(),
      confidenceByProvider:
          (json['confidenceByProvider'] as Map<String, dynamic>).map(
        (k, e) => MapEntry(
            $enumDecode(_$VisionProviderEnumMap, k), (e as num).toDouble()),
      ),
      labelConsensus: json['labelConsensus'] as String,
    );

Map<String, dynamic> _$$EnsembleDetailsImplToJson(
        _$EnsembleDetailsImpl instance) =>
    <String, dynamic>{
      'providerAgreement': instance.providerAgreement,
      'confidenceByProvider': instance.confidenceByProvider
          .map((k, e) => MapEntry(_$VisionProviderEnumMap[k]!, e)),
      'labelConsensus': instance.labelConsensus,
    };

const _$VisionProviderEnumMap = {
  VisionProvider.meta: 'meta',
  VisionProvider.google: 'google',
  VisionProvider.aws: 'aws',
  VisionProvider.tensorflow: 'tensorflow',
};
