import 'dart:convert';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:drift/drift.dart';

/// Repository for inventory items in local database
class InventoryRepository {
  InventoryRepository(this._database);
  final AppDatabase _database;

  /// Save a detected object as an inventory item with extracted labels
  Future<int> saveDetection({
    required String photoPath,
    required String thumbnailPath,
    required DetectedObject detection,
  }) async {
    final detectionJson = jsonEncode(detection.toJson());

    final itemId = await _database.into(_database.inventoryItems).insert(
          InventoryItemsCompanion.insert(
            photoPath: photoPath,
            thumbnailPath: thumbnailPath,
            detectionData: detectionJson,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );

    // Extract and save all VLM attributes as key-value labels
    final labels = _extractLabels(detection);
    for (final entry in labels) {
      await _database.into(_database.labels).insert(
            LabelsCompanion.insert(
              itemId: itemId,
              key: entry.key,
              value: entry.value,
              confidence: Value(detection.confidence),
              createdAt: DateTime.now(),
            ),
          );
    }

    return itemId;
  }

  /// Extract all VLM fields as key-value label pairs
  List<_LabelEntry> _extractLabels(DetectedObject detection) {
    final labels = <_LabelEntry>[];

    labels.add(_LabelEntry('label', detection.label));
    labels.add(_LabelEntry('category', detection.category));

    if (detection.brand != null) {
      labels.add(_LabelEntry('brand', detection.brand!));
    }
    if (detection.model != null) {
      labels.add(_LabelEntry('model', detection.model!));
    }
    for (final color in detection.colors) {
      labels.add(_LabelEntry('color', color));
    }
    for (final material in detection.materials) {
      labels.add(_LabelEntry('material', material));
    }
    if (detection.condition != null) {
      labels.add(_LabelEntry('condition', detection.condition!));
    }
    if (detection.description != null) {
      labels.add(_LabelEntry('description', detection.description!));
    }

    return labels;
  }

  /// Get all inventory items
  Future<List<InventoryItem>> getAllItems() async {
    return (_database.select(_database.inventoryItems)
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
        .get();
  }

  /// Get item by ID
  Future<InventoryItem?> getItemById(int id) async {
    return (_database.select(_database.inventoryItems)
          ..where((t) => t.id.equals(id)))
        .getSingleOrNull();
  }

  /// Delete item
  Future<void> deleteItem(int id) async {
    await (_database.delete(_database.inventoryItems)
          ..where((t) => t.id.equals(id)))
        .go();
  }

  /// Get labels for item
  Future<List<Label>> getLabelsForItem(int itemId) async {
    return (_database.select(_database.labels)
          ..where((t) => t.itemId.equals(itemId))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
        .get();
  }

  /// Search items using FTS
  Future<List<InventoryItem>> searchItems(String query) async {
    if (query.trim().isEmpty) return [];
    return _database.searchItems(query);
  }

  /// Add label to item
  Future<int> addLabel({
    required int itemId,
    required String key,
    required String value,
  }) async {
    return _database.into(_database.labels).insert(
          LabelsCompanion.insert(
            itemId: itemId,
            key: key,
            value: value,
            createdAt: DateTime.now(),
          ),
        );
  }

  /// Update label
  Future<void> updateLabel({
    required int labelId,
    String? key,
    String? value,
  }) async {
    await (_database.update(_database.labels)
          ..where((t) => t.id.equals(labelId)))
        .write(
      LabelsCompanion(
        key: key != null ? Value(key) : const Value.absent(),
        value: value != null ? Value(value) : const Value.absent(),
      ),
    );
  }

  /// Delete label
  Future<void> deleteLabel(int labelId) async {
    await (_database.delete(_database.labels)
          ..where((t) => t.id.equals(labelId)))
        .go();
  }

  /// Get inventory statistics
  Future<InventoryStats> getStats() async {
    final itemCount =
        await (_database.selectOnly(_database.inventoryItems)
              ..addColumns([_database.inventoryItems.id.count()]))
            .map((row) => row.read(_database.inventoryItems.id.count()) ?? 0)
            .getSingle();

    final labelCount =
        await (_database.selectOnly(_database.labels)
              ..addColumns([_database.labels.id.count()]))
            .map((row) => row.read(_database.labels.id.count()) ?? 0)
            .getSingle();

    final lastItem =
        await (_database.select(_database.inventoryItems)
              ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
              ..limit(1))
            .getSingleOrNull();

    // Count unique label values for categories
    final allLabels = await _database.select(_database.labels).get();
    final uniqueLabels = allLabels.map((l) => l.value).toSet().length;

    return InventoryStats(
      totalItems: itemCount,
      totalLabels: labelCount,
      totalCategories: uniqueLabels,
      lastCaptured: lastItem?.createdAt,
    );
  }
}

/// Simple key-value pair for label extraction
class _LabelEntry {
  _LabelEntry(this.key, this.value);
  final String key;
  final String value;
}

/// Inventory statistics
class InventoryStats {
  InventoryStats({
    required this.totalItems,
    required this.totalLabels,
    required this.totalCategories,
    this.lastCaptured,
  });
  final int totalItems;
  final int totalLabels;
  final int totalCategories;
  final DateTime? lastCaptured;
}
