import 'dart:convert';

import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detection.freezed.dart';
part 'detection.g.dart';

@freezed
abstract class Detection with _$Detection {
  @JsonSerializable(explicitToJson: true)
  const factory Detection({
    required String label,
    required double confidence,
    required BoundingBox boundingBox,
    required EnsembleDetails ensembleDetails,
    required List<AlternativeLabel> alternativeLabels,
    String? id,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) = _Detection;

  factory Detection.fromJson(Map<String, dynamic> json) =>
      _$DetectionFromJson(json);

  /// Helper to encode to JSON string
  const Detection._();
  String toJsonString() => jsonEncode(toJson());
}
