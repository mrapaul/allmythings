import 'vision_provider.dart';

class AlternativeLabel {
  final String label;
  final double confidence;
  final VisionProvider provider;

  AlternativeLabel({
    required this.label,
    required this.confidence,
    required this.provider,
  });

  factory AlternativeLabel.fromJson(Map<String, dynamic> json) {
    return AlternativeLabel(
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      provider: VisionProvider.values.firstWhere(
        (e) => e.toString().split('.').last == json['provider'],
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'label': label,
      'confidence': confidence,
      'provider': provider.toString().split('.').last,
    };
  }
}