// lib/domain/models/detected_object.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detected_object.freezed.dart';
part 'detected_object.g.dart';

@freezed
class DetectedObject with _$DetectedObject {
  const factory DetectedObject({
    // Note: The TypeScript API maps snake_case VLM output to camelCase
    // before sending to mobile. These @JsonKey annotations match what
    // the API actually sends (camelCase). If the API sends snake_case
    // in the future, update these annotations accordingly.
    required int boxIndex,
    required String label,
    required String category,
    required double confidence,
    required BoundingBox boundingBox,
    String? brand,
    String? model,
    @Default([]) List<String> colors,
    @Default([]) List<String> materials,
    String? condition,
    ValueRange? estimatedValue,
    String? description,
  }) = _DetectedObject;

  factory DetectedObject.fromJson(Map<String, dynamic> json) =>
      _$DetectedObjectFromJson(json);
}

@freezed
class BoundingBox with _$BoundingBox {
  const factory BoundingBox({
    required double x,
    required double y,
    required double width,
    required double height,
  }) = _BoundingBox;

  factory BoundingBox.fromJson(Map<String, dynamic> json) =>
      _$BoundingBoxFromJson(json);
}

@freezed
class ValueRange with _$ValueRange {
  const factory ValueRange({
    required double low,
    required double high,
  }) = _ValueRange;

  factory ValueRange.fromJson(Map<String, dynamic> json) =>
      _$ValueRangeFromJson(json);
}
