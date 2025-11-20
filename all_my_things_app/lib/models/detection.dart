import 'bounding_box.dart';

class Detection {
  final String label;
  final double confidence;
  final BoundingBox boundingBox;

  Detection({
    required this.label,
    required this.confidence,
    required this.boundingBox,
  });

  factory Detection.fromJson(Map<String, dynamic> json) {
    return Detection(
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      boundingBox: BoundingBox.fromJson(json['boundingBox'] as Map<String, dynamic>),
    );
  }
}
