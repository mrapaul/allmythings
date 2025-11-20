import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:all_my_things/core/converters/vision_provider_converter.dart';

part 'alternative_label.freezed.dart';
part 'alternative_label.g.dart';

@freezed
abstract class AlternativeLabel with _$AlternativeLabel {
  @JsonSerializable(explicitToJson: true)
  const factory AlternativeLabel({
    required String label,
    required double confidence,
    @VisionProviderConverter() required VisionProvider provider,
  }) = _AlternativeLabel;

  factory AlternativeLabel.fromJson(Map<String, dynamic> json) =>
      _$AlternativeLabelFromJson(json);
}

