// lib/domain/models/detected_object.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'detected_object.freezed.dart';
part 'detected_object.g.dart';

@freezed
abstract class DetectedObject with _$DetectedObject {
  const DetectedObject._();

  const factory DetectedObject({
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
    @Default([]) List<String> searchTags,
  }) = _DetectedObject;

  factory DetectedObject.fromJson(Map<String, dynamic> json) =>
      _$DetectedObjectFromJson(json);

  /// Parse from the new Florence pipeline response format.
  /// Items have an `attributes` sub-object and a `bbox` object.
  static DetectedObject fromApiItem(Map<String, dynamic> item) {
    final attrs = item['attributes'] as Map<String, dynamic>? ?? {};
    final bbox = item['bbox'] as Map<String, dynamic>? ?? {};
    final rawId = item['id'] as String?;
    final boxIndex = int.tryParse(rawId ?? '') ?? 0;
    return DetectedObject(
      boxIndex: boxIndex,
      label: (item['label'] as String?) ?? 'Unknown',
      category: (attrs['category'] as String?) ?? '',
      confidence: (item['confidence'] as num?)?.toDouble() ?? 0.0,
      brand: null,
      model: null,
      colors: attrs['color'] != null ? [attrs['color'] as String] : const [],
      materials:
          attrs['material'] != null ? [attrs['material'] as String] : const [],
      condition: attrs['condition'] as String?,
      estimatedValue: null,
      description: attrs['description'] as String?,
      searchTags: (attrs['search_tags'] as List<dynamic>?)
              ?.whereType<String>()
              .toList() ??
          const [],
      boundingBox: BoundingBox(
        x: (bbox['x'] as num?)?.toDouble() ?? 0.0,
        y: (bbox['y'] as num?)?.toDouble() ?? 0.0,
        width: (bbox['width'] as num?)?.toDouble() ?? 0.0,
        height: (bbox['height'] as num?)?.toDouble() ?? 0.0,
      ),
    );
  }
}

@freezed
abstract class BoundingBox with _$BoundingBox {
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
abstract class ValueRange with _$ValueRange {
  const factory ValueRange({
    required double low,
    required double high,
  }) = _ValueRange;

  factory ValueRange.fromJson(Map<String, dynamic> json) =>
      _$ValueRangeFromJson(json);
}
