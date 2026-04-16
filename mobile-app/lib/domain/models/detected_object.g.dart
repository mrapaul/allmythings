// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'detected_object.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_DetectedObject _$DetectedObjectFromJson(
  Map<String, dynamic> json,
) => _DetectedObject(
  boxIndex: (json['boxIndex'] as num).toInt(),
  label: json['label'] as String,
  category: json['category'] as String,
  confidence: (json['confidence'] as num).toDouble(),
  boundingBox: BoundingBox.fromJson(
    json['boundingBox'] as Map<String, dynamic>,
  ),
  brand: json['brand'] as String?,
  model: json['model'] as String?,
  colors:
      (json['colors'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const [],
  materials:
      (json['materials'] as List<dynamic>?)?.map((e) => e as String).toList() ??
      const [],
  condition: json['condition'] as String?,
  estimatedValue: json['estimatedValue'] == null
      ? null
      : ValueRange.fromJson(json['estimatedValue'] as Map<String, dynamic>),
  description: json['description'] as String?,
  searchTags:
      (json['searchTags'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList() ??
      const [],
);

Map<String, dynamic> _$DetectedObjectToJson(_DetectedObject instance) =>
    <String, dynamic>{
      'boxIndex': instance.boxIndex,
      'label': instance.label,
      'category': instance.category,
      'confidence': instance.confidence,
      'boundingBox': instance.boundingBox,
      'brand': instance.brand,
      'model': instance.model,
      'colors': instance.colors,
      'materials': instance.materials,
      'condition': instance.condition,
      'estimatedValue': instance.estimatedValue,
      'description': instance.description,
      'searchTags': instance.searchTags,
    };

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

_ValueRange _$ValueRangeFromJson(Map<String, dynamic> json) => _ValueRange(
  low: (json['low'] as num).toDouble(),
  high: (json['high'] as num).toDouble(),
);

Map<String, dynamic> _$ValueRangeToJson(_ValueRange instance) =>
    <String, dynamic>{'low': instance.low, 'high': instance.high};
