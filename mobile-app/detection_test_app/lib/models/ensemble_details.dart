import 'vision_provider.dart';

class EnsembleDetails {
  final int providersUsed;
  final int providerAgreement;
  final String labelConsensus;
  final Map<VisionProvider, double> confidenceByProvider;

  EnsembleDetails({
    required this.providersUsed,
    required this.providerAgreement,
    required this.labelConsensus,
    required this.confidenceByProvider,
  });

  factory EnsembleDetails.fromJson(Map<String, dynamic> json) {
    return EnsembleDetails(
      providersUsed: json['providersUsed'] as int,
      providerAgreement: json['providerAgreement'] as int,
      labelConsensus: json['labelConsensus'] as String,
      confidenceByProvider: (json['confidenceByProvider'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(
          VisionProvider.values.firstWhere(
            (e) => e.toString().split('.').last == key,
          ),
          (value as num).toDouble(),
        ),
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'providersUsed': providersUsed,
      'providerAgreement': providerAgreement,
      'labelConsensus': labelConsensus,
      'confidenceByProvider': confidenceByProvider.map(
        (key, value) => MapEntry(
          key.toString().split('.').last,
          value,
        ),
      ),
    };
  }
}