import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:flutter/foundation.dart';
import 'package:home_inventory/domain/models/vision_provider.dart';
import 'package:home_inventory/core/converters/vision_provider_converter.dart';

part 'alternative_label.freezed.dart';
part 'alternative_label.g.dart';

@freezed
class AlternativeLabel with _$AlternativeLabel {
  const factory AlternativeLabel({
    required String label,
    required double confidence,
    required VisionProvider provider,
  }) = _AlternativeLabel;

  factory AlternativeLabel.fromJson(Map<String, dynamic> json) {
    return AlternativeLabel(
      label: json['label'] as String,
      confidence: json['confidence'] as double,
      provider: const VisionProviderConverter().fromJson(json['provider'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'label': label,
      'confidence': confidence,
      'provider': const VisionProviderConverter().toJson(provider),
    };
  }

  static List<AlternativeLabel> listFromJson(List<dynamic> json) =>
      json.map((e) => AlternativeLabel.fromJson(e as Map<String, dynamic>)).toList();

  static List<Map<String, dynamic>> listToJson(List<AlternativeLabel> list) =>
      list.map((e) => e.toJson()).toList();
}
