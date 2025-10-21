import 'package:freezed_annotation/freezed_annotation.dart';
import 'vision_provider.dart';

part 'ensemble_details.freezed.dart';
part 'ensemble_details.g.dart';

/// Details about how ensemble providers agreed on a detection
@freezed
class EnsembleDetails with _$EnsembleDetails {
  const factory EnsembleDetails({
    /// Number of providers that detected this object
    required int providerAgreement,

    /// Confidence scores from each provider
    required Map<VisionProvider, double> confidenceByProvider,

    /// How providers agreed on the label (unanimous, majority, etc.)
    required String labelConsensus,
  }) = _EnsembleDetails;

  factory EnsembleDetails.fromJson(Map<String, dynamic> json) =>
      _$EnsembleDetailsFromJson(json);
}
