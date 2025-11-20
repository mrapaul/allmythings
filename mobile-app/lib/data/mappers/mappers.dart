import 'dart:convert';

import 'package:all_my_things/data/database/app_database.dart' as db;
import 'package:all_my_things/domain/models/inventory_item.dart' as domain;
import 'package:all_my_things/domain/models/label.dart' as domain;

/// Mappers to convert Drift data entities to domain models.

extension InventoryItemMapper on db.InventoryItem {
  domain.InventoryItem toDomain() {
    return domain.InventoryItem(
      id: id,
      photoPath: photoPath,
      thumbnailPath: thumbnailPath,
      detection: domain.Detection.fromJson(
        jsonDecode(detectionData) as Map<String, dynamic>,
      ),
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}

extension LabelMapper on db.Label {
  domain.Label toDomain() {
    return domain.Label(
      id: id,
      itemId: itemId,
      key: key,
      value: value,
      createdAt: createdAt,
    );
  }
}
