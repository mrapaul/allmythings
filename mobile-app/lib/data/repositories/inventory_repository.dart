import 'dart:convert';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:drift/drift.dart';
import 'package:fpdart/fpdart.dart';

/// Repository for inventory items in local database
class InventoryRepository {
  InventoryRepository(this._database);
  final AppDatabase _database;

  /// Create a single inventory item with its associated labels
  Future<Either<String, int>> createItem({
    required String name,
    required String photoPath,
    required String thumbnailPath,
    required List<Detection> detections,
  }) async {
    try {
      final detectionJson = jsonEncode(detections.map((d) => d.toJson()).toList());

      final itemId = await _database.into(_database.inventoryItems).insert(
            InventoryItemsCompanion.insert(
              photoPath: photoPath,
              thumbnailPath: thumbnailPath,
              detectionData: detectionJson,
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            ),
          );

      // Add the primary item name as a label
      await _database.into(_database.labels).insert(
            LabelsCompanion.insert(
              itemId: itemId,
              value: name,
              createdAt: DateTime.now(),
            ),
          );

      // Add each detection as a label
      for (final detection in detections) {
        await _database.into(_database.labels).insert(
              LabelsCompanion.insert(
                itemId: itemId,
                value: detection.label,
                createdAt: DateTime.now(),
              ),
            );
      }

      return right(itemId);
    } catch (e) {
      return left('Failed to create inventory item: $e');
    }
  }

  /// Add multiple inventory items
  Future<Either<String, List<int>>> addItems(List<InventoryItem> items) async {
    try {
      final itemIds = <int>[];
      for (final item in items) {
        final itemId = await _database
            .into(_database.inventoryItems)
            .insert(
              InventoryItemsCompanion.insert(
                photoPath: item.photoPath,
                thumbnailPath: item.thumbnailPath,
                detectionData: item.detectionData,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              ),
            );
        itemIds.add(itemId);

        // Create initial label from detection data
        // Assuming detectionData is a JSON string of a Detection object
        // final detection = Detection.fromJson(jsonDecode(item.detectionData) as Map<String, dynamic>);
        await _database
            .into(_database.labels)
            .insert(
              LabelsCompanion.insert(
                itemId: itemId,
                value: 'placeholder', // detection.label,
                createdAt: DateTime.now(),
              ),
            );
      }
      return right(itemIds);
    } catch (e) {
      return left(
        'Failed to add inventory items: $e',
      );
    }
  }

  /// Get all inventory items
  Future<Either<String, List<InventoryItem>>> getAllItems() async {
    try {
      final items = await (_database.select(
        _database.inventoryItems,
      )..orderBy([(t) => OrderingTerm.desc(t.createdAt)])).get();

      return right(items);
    } catch (e) {
      return left(
        'Failed to get inventory items: $e',
      );
    }
  }

  /// Get item by ID
  Future<Either<String, InventoryItem?>> getItemById(int id) async {
    try {
      final item = await (_database.select(
        _database.inventoryItems,
      )..where((t) => t.id.equals(id))).getSingleOrNull();

      return right(item);
    } catch (e) {
      return left(
        'Failed to get inventory item: $e',
      );
    }
  }

  /// Delete item
  Future<Either<String, void>> deleteItem(int id) async {
    try {
      await (_database.delete(
        _database.inventoryItems,
      )..where((t) => t.id.equals(id))).go();

      return right(null);
    } catch (e) {
      return left(
        'Failed to delete inventory item: $e',
      );
    }
  }

  /// Get labels for item
  Future<Either<String, List<Label>>> getLabelsForItem(int itemId) async {
    try {
      final labels =
          await (_database.select(_database.labels)
                ..where((t) => t.itemId.equals(itemId))
                ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
              .get();

      return right(labels);
    } catch (e) {
      return left(
        'Failed to get labels: $e',
      );
    }
  }

  /// Simple LIKE-based search on labels, returns matching items
  Future<Either<String, List<InventoryItem>>> searchItems(String query) async {
    try {
      final like = '%${query.replaceAll('%', r'\%').replaceAll('_', r'\_')}%';
      final matchedLabels = await (_database.select(
        _database.labels,
      )..where((t) => t.value.like(like))).get();

      if (matchedLabels.isEmpty) return right([]);

      final itemIds = matchedLabels.map((l) => l.itemId).toSet().toList();
      final items =
          await (_database.select(_database.inventoryItems)
                ..where((t) => t.id.isIn(itemIds))
                ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
              .get();

      return right(items);
    } catch (e) {
      return left('Failed to search items: $e');
    }
  }

  /// Add label to item
  Future<Either<String, int>> addLabel({
    required int itemId,
    required String value,
    String? key,
  }) async {
    try {
      final labelId = await _database
          .into(_database.labels)
          .insert(
            LabelsCompanion.insert(
              itemId: itemId,
              key: key != null ? Value(key) : const Value.absent(),
              value: value,
              createdAt: DateTime.now(),
            ),
          );

      return right(labelId);
    } catch (e) {
      return left(
        'Failed to add label: $e',
      );
    }
  }

  /// Update label
  Future<Either<String, void>> updateLabel({
    required int labelId,
    required String? value,
    String? key,
  }) async {
    try {
      await (_database.update(
        _database.labels,
      )..where((t) => t.id.equals(labelId))).write(
        LabelsCompanion(
          key: key != null ? Value(key) : const Value.absent(),
          value: value != null ? Value(value) : const Value.absent(),
        ),
      );

      return right(null);
    } catch (e) {
      return left(
        'Failed to update label: $e',
      );
    }
  }

  /// Delete label
  Future<Either<String, void>> deleteLabel(int labelId) async {
    try {
      await (_database.delete(
        _database.labels,
      )..where((t) => t.id.equals(labelId))).go();

      return right(null);
    } catch (e) {
      return left(
        'Failed to delete label: $e',
      );
    }
  }

  /// Get inventory statistics
  Future<Either<String, InventoryStats>> getStats() async {
    try {
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

      // Calculate estimated categories: count unique labels where key is null or 'Category'
      final categoryLabels = await (_database.select(
        _database.labels,
      )..where((t) => t.key.isNull() | t.key.equals('Category'))).get();
      final totalCategories = categoryLabels.map((l) => l.value).toSet().length;

      return right(
        InventoryStats(
          totalItems: itemCount,
          totalLabels: labelCount,
          totalCategories: totalCategories,
          lastCaptured: lastItem?.createdAt,
        ),
      );
    } catch (e) {
      return left(
        'Failed to get stats: $e',
      );
    }
  }
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
