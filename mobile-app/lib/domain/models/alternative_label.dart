import 'package:freezed_annotation/freezed_annotation.dart';
import 'vision_provider.dart';

part 'alternative_label.freezed.dart';
part 'alternative_label.g.dart';

/// Alternative label suggestion from a provider
@freezed
class AlternativeLabel with _$AlternativeLabel {
  const factory AlternativeLabel({
    /// Alternative label name
    required String label,

    /// Confidence score for this label (0-1)
    required double confidence,

    /// Which provider suggested this label
    required VisionProvider provider,
  }) = _AlternativeLabel;

  factory AlternativeLabel.fromJson(Map<String, dynamic> json) =>
      _$AlternativeLabelFromJson(json);
}
