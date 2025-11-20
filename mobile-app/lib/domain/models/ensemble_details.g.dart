// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ensemble_details.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_EnsembleDetails _$EnsembleDetailsFromJson(Map<String, dynamic> json) =>
    _EnsembleDetails(
      providersUsed: (json['providersUsed'] as num).toInt(),
      providerAgreement: (json['providerAgreement'] as num).toInt(),
      labelConsensus: json['labelConsensus'] as String,
      confidenceByProvider: json['confidenceByProvider'] == null
          ? const {}
          : _confidenceByProviderFromJson(
              json['confidenceByProvider'] as Map<String, dynamic>?,
            ),
    );

Map<String, dynamic> _$EnsembleDetailsToJson(_EnsembleDetails instance) =>
    <String, dynamic>{
      'providersUsed': instance.providersUsed,
      'providerAgreement': instance.providerAgreement,
      'labelConsensus': instance.labelConsensus,
      'confidenceByProvider': _confidenceByProviderToJson(
        instance.confidenceByProvider,
      ),
    };
