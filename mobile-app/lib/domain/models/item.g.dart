// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Item _$ItemFromJson(Map<String, dynamic> json) => _Item(
  id: json['id'] as String,
  name: json['name'] as String,
  description: json['description'] as String?,
  imagePath: json['imagePath'] as String,
  labels: (json['labels'] as List<dynamic>).map((e) => e as String).toList(),
  roomType: json['roomType'] as String?,
  confidence: (json['confidence'] as num?)?.toDouble() ?? 1.0,
  createdAt: json['createdAt'] == null
      ? null
      : DateTime.parse(json['createdAt'] as String),
  updatedAt: json['updatedAt'] == null
      ? null
      : DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$ItemToJson(_Item instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'description': instance.description,
  'imagePath': instance.imagePath,
  'labels': instance.labels,
  'roomType': instance.roomType,
  'confidence': instance.confidence,
  'createdAt': instance.createdAt?.toIso8601String(),
  'updatedAt': instance.updatedAt?.toIso8601String(),
};
