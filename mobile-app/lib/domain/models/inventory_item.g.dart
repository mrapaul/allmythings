// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inventory_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_InventoryItem _$InventoryItemFromJson(Map<String, dynamic> json) =>
    _InventoryItem(
      id: (json['id'] as num).toInt(),
      photoPath: json['photoPath'] as String,
      thumbnailPath: json['thumbnailPath'] as String,
      detectionData: json['detectionData'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$InventoryItemToJson(_InventoryItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'photoPath': instance.photoPath,
      'thumbnailPath': instance.thumbnailPath,
      'detectionData': instance.detectionData,
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt.toIso8601String(),
    };

_ItemLabel _$ItemLabelFromJson(Map<String, dynamic> json) => _ItemLabel(
  id: (json['id'] as num).toInt(),
  itemId: (json['itemId'] as num).toInt(),
  key: json['key'] as String,
  value: json['value'] as String,
  confidence: (json['confidence'] as num?)?.toDouble() ?? 1.0,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$ItemLabelToJson(_ItemLabel instance) =>
    <String, dynamic>{
      'id': instance.id,
      'itemId': instance.itemId,
      'key': instance.key,
      'value': instance.value,
      'confidence': instance.confidence,
      'createdAt': instance.createdAt.toIso8601String(),
    };
