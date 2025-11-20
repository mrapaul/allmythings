import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'ensemble_details.freezed.dart';
part 'ensemble_details.g.dart';

@freezed
abstract class EnsembleDetails with _$EnsembleDetails {
  const factory EnsembleDetails({
    required int providersUsed,
    required int providerAgreement,
    required String labelConsensus,
    @Default({})
    @JsonKey(
      fromJson: _confidenceByProviderFromJson,
      toJson: _confidenceByProviderToJson,
    )
    Map<VisionProvider, double> confidenceByProvider,
  }) = _EnsembleDetails;

  factory EnsembleDetails.fromJson(Map<String, dynamic> json) =>
      _$EnsembleDetailsFromJson(json);
}

Map<VisionProvider, double> _confidenceByProviderFromJson(
  Map<String, dynamic>? json,
) {
  if (json == null) return {};
  final result = <VisionProvider, double>{};
  json.forEach((key, value) {
    final vp = VisionProvider.values.firstWhere(
      (e) => e.name == key,
      orElse: () => VisionProvider.mock,
    );
    result[vp] = (value as num).toDouble();
  });
  return result;
}

Map<String, dynamic> _confidenceByProviderToJson(
  Map<VisionProvider, double> map,
) {
  final result = <String, dynamic>{};
  map.forEach((key, value) {
    result[key.name] = value;
  });
  return result;
}
