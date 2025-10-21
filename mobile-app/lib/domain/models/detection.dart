import 'package:freezed_annotation/freezed_annotation.dart';
import 'bounding_box.dart';
import 'ensemble_details.dart';
import 'alternative_label.dart';

part 'detection.freezed.dart';
part 'detection.g.dart';

/// A detected object in an image
@freezed
class Detection with _$Detection {
  const factory Detection({
    /// Unique identifier for this detection
    required String id,

    /// Primary label (after ensemble consensus)
    required String label,

    /// Final confidence score (after ensemble fusion)
    required double confidence,

    /// Bounding box coordinates
    required BoundingBox boundingBox,

    /// Ensemble voting details
    required EnsembleDetails ensembleDetails,

    /// Alternative labels from providers
    required List<AlternativeLabel> alternativeLabels,
  }) = _Detection;

  factory Detection.fromJson(Map<String, dynamic> json) =>
      _$DetectionFromJson(json);
}
