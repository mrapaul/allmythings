import 'package:freezed_annotation/freezed_annotation.dart';

part 'bounding_box.freezed.dart';
part 'bounding_box.g.dart';

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
