// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bounding_box.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_BoundingBox _$BoundingBoxFromJson(Map<String, dynamic> json) => _BoundingBox(
  x: (json['x'] as num).toDouble(),
  y: (json['y'] as num).toDouble(),
  width: (json['width'] as num).toDouble(),
  height: (json['height'] as num).toDouble(),
);

Map<String, dynamic> _$BoundingBoxToJson(_BoundingBox instance) =>
    <String, dynamic>{
      'x': instance.x,
      'y': instance.y,
      'width': instance.width,
      'height': instance.height,
    };
