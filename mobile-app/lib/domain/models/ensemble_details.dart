import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:flutter/foundation.dart';
import 'package:home_inventory/domain/models/vision_provider.dart';
import 'package:home_inventory/core/converters/vision_provider_converter.dart';

part 'ensemble_details.freezed.dart';
part 'ensemble_details.g.dart';

@freezed
class EnsembleDetails with _$EnsembleDetails {
  const factory EnsembleDetails({
    required int providersUsed,
    required int providerAgreement,
    required String labelConsensus,
    required Map<VisionProvider, double> confidenceByProvider,
  }) = _EnsembleDetails;

  factory EnsembleDetails.fromJson(Map<String, dynamic> json) {
    final confidenceByProviderJson = json['confidenceByProvider'] as Map<String, dynamic>;
    final Map<VisionProvider, double> confidenceByProvider = {};
    confidenceByProviderJson.forEach((key, value) {
      confidenceByProvider[const VisionProviderConverter().fromJson(key)] = value as double;
    });

    return EnsembleDetails(
      providersUsed: json['providersUsed'] as int,
      providerAgreement: json['providerAgreement'] as int,
      labelConsensus: json['labelConsensus'] as String,
      confidenceByProvider: confidenceByProvider,
    );
  }

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> confidenceByProviderJson = {};
    confidenceByProvider.forEach((key, value) {
      confidenceByProviderJson[const VisionProviderConverter().toJson(key)] = value;
    });

    return {
      'providersUsed': providersUsed,
      'providerAgreement': providerAgreement,
      'labelConsensus': labelConsensus,
      'confidenceByProvider': confidenceByProviderJson,
    };
  }
}
