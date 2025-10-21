import 'package:freezed_annotation/freezed_annotation.dart';

part 'bounding_box.freezed.dart';
part 'bounding_box.g.dart';

/// Bounding box coordinates for detected objects (normalized 0-1 range)
@freezed
class BoundingBox with _$BoundingBox {
  const factory BoundingBox({
    /// X coordinate of top-left corner (0-1)
    required double x,

    /// Y coordinate of top-left corner (0-1)
    required double y,

    /// Width of bounding box (0-1)
    required double width,

    /// Height of bounding box (0-1)
    required double height,
  }) = _BoundingBox;

  const BoundingBox._();

  /// Validate that coordinates are in valid range
  bool get isValid =>
      x >= 0 && x <= 1 &&
      y >= 0 && y <= 1 &&
      width >= 0 && width <= 1 &&
      height >= 0 && height <= 1 &&
      (x + width) <= 1 &&
      (y + height) <= 1;

  factory BoundingBox.fromJson(Map<String, dynamic> json) =>
      _$BoundingBoxFromJson(json);
}
