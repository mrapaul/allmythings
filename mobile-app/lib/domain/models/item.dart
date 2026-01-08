import 'package:freezed_annotation/freezed_annotation.dart';

part 'item.freezed.dart';
part 'item.g.dart';

/// Domain model for an inventory item
@freezed
class Item with _$Item {
  const factory Item({
    /// Unique identifier for the item
    required String id,

    /// Display name of the item
    required String name,

    /// Path to the item's image/photo
    required String imagePath, /// List of labels/tags assigned to this item
    required List<String> labels, /// Optional description of the item
    String? description,

    /// Optional room type where item is located
    String? roomType,

    /// Confidence score from detection (0-1)
    @Default(1.0) double confidence,

    /// Timestamp when item was created
    DateTime? createdAt,

    /// Timestamp when item was last updated
    DateTime? updatedAt,
  }) = _Item;

  factory Item.fromJson(Map<String, dynamic> json) => _$ItemFromJson(json);
}
