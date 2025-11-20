import 'alternative_label.dart';
import 'bounding_box.dart';
import 'ensemble_details.dart';

class Detection {
  final String label;
  final double confidence;
  final BoundingBox boundingBox;
  final EnsembleDetails ensembleDetails;
  final List<AlternativeLabel> alternativeLabels;
  final String? id;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Detection({
    required this.label,
    required this.confidence,
    required this.boundingBox,
    required this.ensembleDetails,
    required this.alternativeLabels,
    this.id,
    this.createdAt,
    this.updatedAt,
  });

  factory Detection.fromJson(Map<String, dynamic> json) {
    return Detection(
      label: json['label'] as String,
      confidence: (json['confidence'] as num).toDouble(),
      boundingBox: BoundingBox.fromJson(json['boundingBox'] as Map<String, dynamic>),
      ensembleDetails: EnsembleDetails.fromJson(json['ensembleDetails'] as Map<String, dynamic>),
      alternativeLabels: (json['alternativeLabels'] as List<dynamic>)
          .map((e) => AlternativeLabel.fromJson(e as Map<String, dynamic>))
          .toList(),
      id: json['id'] as String?,
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'label': label,
      'confidence': confidence,
      'boundingBox': boundingBox.toJson(),
      'ensembleDetails': ensembleDetails.toJson(),
      'alternativeLabels': alternativeLabels.map((e) => e.toJson()).toList(),
      'id': id,
      'createdAt': createdAt?.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
    };
  }
}