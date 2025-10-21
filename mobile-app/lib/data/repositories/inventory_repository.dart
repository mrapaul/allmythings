import 'dart:convert';
import 'package:drift/drift.dart';
import 'package:fpdart/fpdart.dart';
import '../../core/errors/failures.dart';
import '../../domain/models/detection.dart';
import '../database/app_database.dart';

/// Repository for inventory items in local database
class InventoryRepository {
  final AppDatabase _database;

  InventoryRepository(this._database);

  /// Create inventory item from detection
  Future<Either<Failure, int>> createItem({
    required String photoPath,
    required String thumbnailPath,
    required Detection detection,
  }) async {
    try {
      // Serialize detection data to JSON
      final detectionJson = jsonEncode(detection.toJson());

      // Insert into database
      final itemId = await _database.into(_database.inventoryItems).insert(
        InventoryItemsCompanion.insert(
          photoPath: photoPath,
          thumbnailPath: thumbnailPath,
          detectionData: detectionJson,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
      );

      // Create initial label from detection
      await _database.into(_database.labels).insert(
        LabelsCompanion.insert(
          itemId: itemId,
          value: detection.label,
          createdAt: DateTime.now(),
        ),
      );

      return right(itemId);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to create inventory item: $e'),
      );
    }
  }

  /// Get all inventory items
  Future<Either<Failure, List<InventoryItem>>> getAllItems() async {
    try {
      final items = await (_database.select(_database.inventoryItems)
            ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
          .get();

      return right(items);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to get inventory items: $e'),
      );
    }
  }

  /// Get item by ID
  Future<Either<Failure, InventoryItem?>> getItemById(int id) async {
    try {
      final item = await (_database.select(_database.inventoryItems)
            ..where((t) => t.id.equals(id)))
          .getSingleOrNull();

      return right(item);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to get inventory item: $e'),
      );
    }
  }

  /// Delete item
  Future<Either<Failure, void>> deleteItem(int id) async {
    try {
      await (_database.delete(_database.inventoryItems)
            ..where((t) => t.id.equals(id)))
          .go();

      return right(null);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to delete inventory item: $e'),
      );
    }
  }

  /// Get labels for item
  Future<Either<Failure, List<Label>>> getLabelsForItem(int itemId) async {
    try {
      final labels = await (_database.select(_database.labels)
            ..where((t) => t.itemId.equals(itemId))
            ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
          .get();

      return right(labels);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to get labels: $e'),
      );
    }
  }

  /// Search items using LIKE query on labels
  Future<Either<Failure, List<InventoryItem>>> searchItems(String query) async {
    try {
      if (query.trim().isEmpty) {
        return getAllItems();
      }

      // Search labels using LIKE
      final searchPattern = '%${query.trim()}%';
      final labels = await (_database.select(_database.labels)
            ..where((t) => t.value.like(searchPattern)))
          .get();

      if (labels.isEmpty) {
        return right([]);
      }

      // Get unique item IDs
      final itemIds = labels.map((l) => l.itemId).toSet().toList();

      // Get items
      final items = await (_database.select(_database.inventoryItems)
            ..where((t) => t.id.isIn(itemIds))
            ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
          .get();

      return right(items);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to search items: $e'),
      );
    }
  }

  /// Add label to item
  Future<Either<Failure, int>> addLabel({
    required int itemId,
    String? key,
    required String value,
  }) async {
    try {
      final labelId = await _database.into(_database.labels).insert(
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
        Failure.storage(message: 'Failed to add label: $e'),
      );
    }
  }

  /// Update label
  Future<Either<Failure, void>> updateLabel({
    required int labelId,
    String? key,
    String? value,
  }) async {
    try {
      await (_database.update(_database.labels)
            ..where((t) => t.id.equals(labelId)))
          .write(
        LabelsCompanion(
          key: key != null ? Value(key) : const Value.absent(),
          value: value != null ? Value(value) : const Value.absent(),
        ),
      );

      return right(null);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to update label: $e'),
      );
    }
  }

  /// Delete label
  Future<Either<Failure, void>> deleteLabel(int labelId) async {
    try {
      await (_database.delete(_database.labels)
            ..where((t) => t.id.equals(labelId)))
          .go();

      return right(null);
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to delete label: $e'),
      );
    }
  }

  /// Get inventory statistics
  Future<Either<Failure, InventoryStats>> getStats() async {
    try {
      final itemCount = await (_database.selectOnly(_database.inventoryItems)
            ..addColumns([_database.inventoryItems.id.count()]))
          .map((row) => row.read(_database.inventoryItems.id.count()) ?? 0)
          .getSingle();

      final labelCount = await (_database.selectOnly(_database.labels)
            ..addColumns([_database.labels.id.count()]))
          .map((row) => row.read(_database.labels.id.count()) ?? 0)
          .getSingle();

      final lastItem = await (_database.select(_database.inventoryItems)
            ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
            ..limit(1))
          .getSingleOrNull();

      return right(
        InventoryStats(
          totalItems: itemCount,
          totalLabels: labelCount,
          lastCaptured: lastItem?.createdAt,
        ),
      );
    } catch (e) {
      return left(
        Failure.storage(message: 'Failed to get stats: $e'),
      );
    }
  }
}

/// Inventory statistics
class InventoryStats {
  final int totalItems;
  final int totalLabels;
  final DateTime? lastCaptured;

  InventoryStats({
    required this.totalItems,
    required this.totalLabels,
    this.lastCaptured,
  });
}
