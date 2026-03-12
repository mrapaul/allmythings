import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_item.freezed.dart';
part 'inventory_item.g.dart';

@freezed
sealed class InventoryItem with _$InventoryItem {
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
sealed class ItemLabel with _$ItemLabel {
  const factory ItemLabel({
    required int id,
    required int itemId,
    required String key,
    required String value,
    @Default(1.0) double confidence,
    required DateTime createdAt,
  }) = _ItemLabel;

  factory ItemLabel.fromJson(Map<String, dynamic> json) =>
      _$ItemLabelFromJson(json);
}
