import 'dart:convert';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:drift/drift.dart';

/// Repository for inventory items in local database
class InventoryRepository {
  InventoryRepository(this._database);
  final AppDatabase _database;

  /// Create a new inventory item in pending state
  Future<int> createPendingItem({
    required String photoPath,
    required String thumbnailPath,
  }) async {
    final companion = InventoryItemsCompanion.insert(
      photoPath: photoPath,
      thumbnailPath: thumbnailPath,
      detectionData: '{}',
      status: const Value('pending'),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    return _database.into(_database.inventoryItems).insert(companion);
  }

  /// Update item status and detection data
  Future<void> updateItemStatus({
    required int itemId,
    required String status,
    String? detectionData,
  }) async {
    final companion = InventoryItemsCompanion(
      status: Value(status),
      updatedAt: Value(DateTime.now()),
      detectionData: detectionData != null ? Value(detectionData) : const Value.absent(),
    );

    await (_database.update(_database.inventoryItems)..where((t) => t.id.equals(itemId)))
        .write(companion);
  }

  /// Update item thumbnail path
  Future<void> updateThumbnail(int itemId, String thumbnailPath) async {
    await (_database.update(_database.inventoryItems)..where((t) => t.id.equals(itemId)))
        .write(InventoryItemsCompanion(thumbnailPath: Value(thumbnailPath)));
  }

  /// Extract labels from a DetectionResult
  List<LabelEntry> extractLabelsFromResult(DetectionResult result) {
    final labels = <LabelEntry>[];
    for (final detection in result.detections) {
      labels.add(LabelEntry('type', detection.label));
      if (detection.category.isNotEmpty && detection.category != detection.label) {
        labels.add(LabelEntry('category', detection.category));
      }
      if (detection.brand != null) labels.add(LabelEntry('brand', detection.brand!));
      if (detection.model != null) labels.add(LabelEntry('model', detection.model!));
      for (final color in detection.colors) {
        labels.add(LabelEntry('color', color));
      }
      for (final material in detection.materials) {
        labels.add(LabelEntry('material', material));
      }
      if (detection.condition != null) {
        labels.add(LabelEntry('condition', detection.condition!));
      }
      if (detection.description != null) {
        labels.add(LabelEntry('description', detection.description!));
      }
    }
    return labels;
  }

  /// Replace all labels for an item with a new set
  Future<void> updateItemLabels(int itemId, List<LabelEntry> newLabels) async {
    await _database.transaction(() async {
      // Delete existing labels
      await (_database.delete(_database.labels)
            ..where((t) => t.itemId.equals(itemId)))
          .go();

      // Insert new labels
      for (final label in newLabels) {
        await _database.into(_database.labels).insert(
              LabelsCompanion.insert(
                itemId: itemId,
                key: label.key,
                value: label.value,
                createdAt: DateTime.now(),
              ),
            );
      }
      
      // Update item's updatedAt timestamp
      await (_database.update(_database.inventoryItems)
            ..where((t) => t.id.equals(itemId)))
          .write(InventoryItemsCompanion(updatedAt: Value(DateTime.now())));
    });
  }

  /// Save a detected object as an inventory item with extracted labels (Legacy Support)
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
  List<LabelEntry> _extractLabels(DetectedObject detection) {
    final labels = <LabelEntry>[];
    labels.add(LabelEntry('type', detection.label));
    if (detection.category.isNotEmpty && detection.category != detection.label) {
      labels.add(LabelEntry('type', detection.category));
    }
    if (detection.brand != null) labels.add(LabelEntry('brand', detection.brand!));
    if (detection.model != null) labels.add(LabelEntry('model', detection.model!));
    for (final color in detection.colors) {
      labels.add(LabelEntry('color', color));
    }
    for (final material in detection.materials) {
      labels.add(LabelEntry('material', material));
    }
    if (detection.condition != null) labels.add(LabelEntry('condition', detection.condition!));
    if (detection.description != null) labels.add(LabelEntry('description', detection.description!));
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

  /// Delete an item and its labels
  Future<void> deleteItem(int itemId) async {
    await _database.transaction(() async {
      await (_database.delete(_database.labels)..where((t) => t.itemId.equals(itemId))).go();
      await (_database.delete(_database.inventoryItems)..where((t) => t.id.equals(itemId))).go();
    });
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
class LabelEntry {
  LabelEntry(this.key, this.value);
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
