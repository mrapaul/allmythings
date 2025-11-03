import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:flutter/foundation.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/core/converters/bounding_box_converter.dart';
import 'package:all_my_things/core/converters/ensemble_details_converter.dart';
import 'package:all_my_things/core/converters/alternative_label_list_converter.dart';

part 'detection.freezed.dart';
part 'detection.g.dart';

@JsonSerializable(explicitToJson: true)
@freezed
class Detection with _$Detection {
  const factory Detection({
    String? id,
    required String label,
    required double confidence,
    @BoundingBoxConverter() required BoundingBox boundingBox,
    @EnsembleDetailsConverter() required EnsembleDetails ensembleDetails,
    @AlternativeLabelListConverter() required List<AlternativeLabel> alternativeLabels,
  }) = _Detection;

  factory Detection.fromJson(Map<String, dynamic> json) =>
      _$DetectionFromJson(json);

  String toJsonString() => jsonEncode(toJson());
}