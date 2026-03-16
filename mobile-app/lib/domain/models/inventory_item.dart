// lib/domain/models/inventory_item.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_item.freezed.dart';
part 'inventory_item.g.dart';

@freezed
abstract class InventoryItem with _$InventoryItem {
  const factory InventoryItem({
    required int id,
    required String photoPath,
    required String thumbnailPath,
    required String detectionData,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _InventoryItem;

  factory InventoryItem.fromJson(Map<String, dynamic> json) =>
      _$InventoryItemFromJson(json);
}

@freezed
abstract class ItemLabel with _$ItemLabel {
  const factory ItemLabel({
    required int id,
    required int itemId,
    required String key,
    required String value,
    required DateTime createdAt, @Default(1.0) double confidence,
  }) = _ItemLabel;

  factory ItemLabel.fromJson(Map<String, dynamic> json) =>
      _$ItemLabelFromJson(json);
}
