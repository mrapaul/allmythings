# Database Implementation Guide - Mobile App (Drift)

## Overview

This directory contains the Drift database implementation for the Visual Home Inventory Manager mobile app. Drift provides type-safe, reactive database access with compile-time query validation.

## Directory Structure

```
lib/data/database/
├── README.md                          # This file
├── app_database.dart                  # Main database class
├── app_database.g.dart                # Generated code (don't edit)
├── schema/
│   └── inventory_schema.drift         # Schema definition (SQL)
├── migrations/
│   └── schema_versions.dart           # Migration logic
├── tables/
│   ├── inventory_items.dart           # Dart table definitions
│   ├── labels.dart
│   ├── tags.dart
│   └── ...
└── daos/
    ├── inventory_dao.dart             # Data Access Objects
    ├── label_dao.dart
    └── ...
```

## Quick Start

### 1. Define Tables (Drift Files)

Tables are defined in `.drift` files using SQL syntax:

```sql
-- lib/data/database/schema/inventory_schema.drift

CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
) AS InventoryItemEntity;
```

### 2. Generate Dart Code

```bash
# One-time generation
dart run build_runner build

# Watch mode (auto-regenerate on changes)
dart run build_runner watch
```

### 3. Create Database Class

```dart
// lib/data/database/app_database.dart

import 'package:drift/drift.dart';
import 'package:drift/native.dart';

part 'app_database.g.dart';

@DriftDatabase(
  include: {'schema/inventory_schema.drift'},
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 1;
}
```

### 4. Initialize Database

```dart
// lib/core/database/database_provider.dart

import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'inventory.db'));

    return NativeDatabase(file, logStatements: true);
  });
}

final database = AppDatabase(_openConnection());
```

---

## Data Access Objects (DAOs)

DAOs encapsulate database operations and provide clean, reusable APIs.

### Example: Inventory DAO

```dart
// lib/data/database/daos/inventory_dao.dart

import 'package:drift/drift.dart';
import '../app_database.dart';

part 'inventory_dao.g.dart';

@DriftAccessor(include: {'../schema/inventory_schema.drift'})
class InventoryDao extends DatabaseAccessor<AppDatabase> with _$InventoryDaoMixin {
  InventoryDao(AppDatabase db) : super(db);

  // ============================================================================
  // CREATE
  // ============================================================================

  /// Create a new inventory item
  Future<String> createItem(InventoryItemsCompanion item) async {
    return await into(inventoryItems).insert(item);
  }

  /// Batch insert multiple items
  Future<void> createItems(List<InventoryItemsCompanion> items) async {
    await batch((batch) {
      batch.insertAll(inventoryItems, items);
    });
  }

  // ============================================================================
  // READ
  // ============================================================================

  /// Get single item by ID
  Future<InventoryItem?> getItemById(String id) {
    return (select(inventoryItems)
      ..where((item) => item.id.equals(id))
    ).getSingleOrNull();
  }

  /// Watch single item (reactive)
  Stream<InventoryItem?> watchItemById(String id) {
    return (select(inventoryItems)
      ..where((item) => item.id.equals(id))
    ).watchSingleOrNull();
  }

  /// Get user's items with pagination
  Future<List<InventoryItem>> getUserItems({
    required String userId,
    int limit = 20,
    int offset = 0,
  }) {
    return (select(inventoryItems)
      ..where((item) => item.userId.equals(userId) & item.deletedAt.isNull())
      ..orderBy([
        (item) => OrderingTerm.desc(item.createdAt),
      ])
      ..limit(limit, offset: offset)
    ).get();
  }

  /// Watch user's items (reactive)
  Stream<List<InventoryItem>> watchUserItems({
    required String userId,
    int limit = 20,
  }) {
    return (select(inventoryItems)
      ..where((item) => item.userId.equals(userId) & item.deletedAt.isNull())
      ..orderBy([
        (item) => OrderingTerm.desc(item.createdAt),
      ])
      ..limit(limit)
    ).watch();
  }

  /// Get items by location (with hierarchy)
  Future<List<InventoryItem>> getItemsByLocation({
    required String userId,
    required String locationPath,
    bool includeSublocations = true,
  }) async {
    if (includeSublocations) {
      // Use custom query for path prefix matching
      return await customSelect(
        '''
        SELECT i.*
        FROM inventory_items i
        INNER JOIN locations l ON i.location_id = l.id
        WHERE i.user_id = ?
          AND l.path LIKE ?
          AND i.deleted_at IS NULL
        ORDER BY i.created_at DESC
        ''',
        variables: [
          Variable.withString(userId),
          Variable.withString('$locationPath%'),
        ],
        readsFrom: {inventoryItems, locations},
      ).asyncMap((row) {
        return InventoryItem.fromData(row.data, db);
      }).get();
    } else {
      // Exact location match
      return (select(inventoryItems).join([
        innerJoin(
          locations,
          locations.id.equalsExp(inventoryItems.locationId),
        ),
      ])
        ..where(inventoryItems.userId.equals(userId) &
                locations.path.equals(locationPath) &
                inventoryItems.deletedAt.isNull())
        ..orderBy([OrderingTerm.desc(inventoryItems.createdAt)])
      ).map((row) => row.readTable(inventoryItems)).get();
    }
  }

  // ============================================================================
  // UPDATE
  // ============================================================================

  /// Update an inventory item
  Future<bool> updateItem(InventoryItemsCompanion item) async {
    return await update(inventoryItems).replace(item);
  }

  /// Partially update item (only specified fields)
  Future<int> updateItemFields({
    required String id,
    String? title,
    String? description,
    String? locationId,
  }) {
    return (update(inventoryItems)..where((item) => item.id.equals(id)))
      .write(InventoryItemsCompanion(
        title: title != null ? Value(title) : Value.absent(),
        description: description != null ? Value(description) : Value.absent(),
        locationId: locationId != null ? Value(locationId) : Value.absent(),
        updatedAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));
  }

  /// Soft delete item
  Future<int> softDeleteItem(String id) {
    return (update(inventoryItems)..where((item) => item.id.equals(id)))
      .write(InventoryItemsCompanion(
        deletedAt: Value(DateTime.now().millisecondsSinceEpoch),
      ));
  }

  // ============================================================================
  // DELETE
  // ============================================================================

  /// Hard delete item (permanent)
  Future<int> deleteItem(String id) {
    return (delete(inventoryItems)..where((item) => item.id.equals(id))).go();
  }

  /// Batch delete items
  Future<int> deleteItems(List<String> ids) {
    return (delete(inventoryItems)..where((item) => item.id.isIn(ids))).go();
  }

  // ============================================================================
  // SEARCH
  // ============================================================================

  /// Full-text search
  Stream<List<InventoryItem>> searchItems({
    required String userId,
    required String query,
    int limit = 50,
  }) {
    final sanitizedQuery = _sanitizeFtsQuery(query);

    return customSelect(
      '''
      SELECT i.*
      FROM item_search_fts fts
      JOIN inventory_items i ON fts.item_id = i.id
      WHERE fts.item_search_fts MATCH ?
        AND i.user_id = ?
        AND i.deleted_at IS NULL
      ORDER BY fts.rank
      LIMIT ?
      ''',
      variables: [
        Variable.withString(sanitizedQuery),
        Variable.withString(userId),
        Variable.withInt(limit),
      ],
      readsFrom: {inventoryItems},
    ).watch().map((rows) {
      return rows.map((row) {
        return InventoryItem.fromData(row.data, db);
      }).toList();
    });
  }

  String _sanitizeFtsQuery(String query) {
    return query
      .trim()
      .replaceAll(RegExp(r'[^\w\s]'), ' ')
      .split(RegExp(r'\s+'))
      .where((term) => term.length >= 2)
      .join(' OR ');
  }

  // ============================================================================
  // COMPLEX QUERIES
  // ============================================================================

  /// Get item with all related data (labels, tags, location)
  Future<InventoryItemWithDetails?> getItemWithDetails(String id) async {
    final item = await getItemById(id);
    if (item == null) return null;

    // Fetch labels
    final labelsQuery = select(itemLabels).join([
      innerJoin(labels, labels.id.equalsExp(itemLabels.labelId)),
    ])..where(itemLabels.itemId.equals(id));

    final labelRows = await labelsQuery.get();
    final itemLabelsData = labelRows.map((row) {
      return LabelWithConfidence(
        label: row.readTable(labels),
        confidence: row.readTable(itemLabels).confidenceScore,
        source: row.readTable(itemLabels).source,
      );
    }).toList();

    // Fetch tags
    final tagsQuery = select(itemTags).join([
      innerJoin(tags, tags.id.equalsExp(itemTags.tagId)),
    ])..where(itemTags.itemId.equals(id));

    final tagRows = await tagsQuery.get();
    final itemTagsData = tagRows.map((row) => row.readTable(tags)).toList();

    // Fetch location
    final location = item.locationId != null
      ? await (select(locations)
          ..where((l) => l.id.equals(item.locationId!))
        ).getSingleOrNull()
      : null;

    return InventoryItemWithDetails(
      item: item,
      labels: itemLabelsData,
      tags: itemTagsData,
      location: location,
    );
  }

  /// Get user statistics
  Future<UserInventoryStats> getUserStats(String userId) async {
    final statsQuery = await customSelect(
      '''
      SELECT
        COUNT(DISTINCT i.id) AS total_items,
        COUNT(DISTINCT i.location_id) AS total_locations,
        COUNT(DISTINCT il.label_id) AS total_labels,
        SUM(i.quantity) AS total_quantity,
        SUM(i.estimated_value_cents) AS total_value_cents,
        MAX(i.created_at) AS last_item_added
      FROM inventory_items i
      LEFT JOIN item_labels il ON i.id = il.item_id
      WHERE i.user_id = ? AND i.deleted_at IS NULL
      ''',
      variables: [Variable.withString(userId)],
    ).getSingle();

    return UserInventoryStats(
      totalItems: statsQuery.read<int>('total_items'),
      totalLocations: statsQuery.read<int>('total_locations'),
      totalLabels: statsQuery.read<int>('total_labels'),
      totalQuantity: statsQuery.read<int>('total_quantity'),
      totalValueCents: statsQuery.read<int>('total_value_cents'),
      lastItemAdded: statsQuery.read<int?>('last_item_added'),
    );
  }
}

// ============================================================================
// DATA MODELS
// ============================================================================

class InventoryItemWithDetails {
  final InventoryItem item;
  final List<LabelWithConfidence> labels;
  final List<Tag> tags;
  final Location? location;

  InventoryItemWithDetails({
    required this.item,
    required this.labels,
    required this.tags,
    this.location,
  });
}

class LabelWithConfidence {
  final Label label;
  final double? confidence;
  final String source;

  LabelWithConfidence({
    required this.label,
    this.confidence,
    required this.source,
  });
}

class UserInventoryStats {
  final int totalItems;
  final int totalLocations;
  final int totalLabels;
  final int totalQuantity;
  final int totalValueCents;
  final int? lastItemAdded;

  UserInventoryStats({
    required this.totalItems,
    required this.totalLocations,
    required this.totalLabels,
    required this.totalQuantity,
    required this.totalValueCents,
    this.lastItemAdded,
  });
}
```

---

## Repository Pattern

Repositories provide a clean abstraction over DAOs for use in the application layer.

```dart
// lib/data/repositories/inventory_repository.dart

import 'package:uuid/uuid.dart';
import '../database/app_database.dart';
import '../database/daos/inventory_dao.dart';

class InventoryRepository {
  final InventoryDao _dao;
  final Uuid _uuid = Uuid();

  InventoryRepository(this._dao);

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /// Create a new inventory item
  Future<InventoryItem> createItem({
    required String userId,
    required String title,
    String? description,
    String? locationId,
  }) async {
    final itemId = _uuid.v4();
    final now = DateTime.now().millisecondsSinceEpoch;

    final item = InventoryItemsCompanion.insert(
      id: Value(itemId),
      userId: userId,
      title: title,
      description: Value(description),
      locationId: Value(locationId),
      createdAt: now,
      updatedAt: now,
    );

    await _dao.createItem(item);

    // Return created item
    return (await _dao.getItemById(itemId))!;
  }

  /// Get user's items (reactive stream)
  Stream<List<InventoryItemWithDetails>> watchUserItems({
    required String userId,
    int limit = 20,
  }) {
    return _dao.watchUserItems(userId: userId, limit: limit)
      .asyncMap((items) async {
        // Batch load details for all items
        return await _batchLoadDetails(items);
      });
  }

  /// Search items
  Stream<List<InventoryItem>> searchItems({
    required String userId,
    required String query,
  }) {
    return _dao.searchItems(userId: userId, query: query);
  }

  /// Update item
  Future<void> updateItem({
    required String id,
    String? title,
    String? description,
    String? locationId,
  }) async {
    await _dao.updateItemFields(
      id: id,
      title: title,
      description: description,
      locationId: locationId,
    );
  }

  /// Delete item (soft delete)
  Future<void> deleteItem(String id) async {
    await _dao.softDeleteItem(id);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  Future<List<InventoryItemWithDetails>> _batchLoadDetails(
    List<InventoryItem> items,
  ) async {
    // Implementation similar to DAO example
    // Batch load labels, tags, locations for all items
    // ...
  }
}
```

---

## Provider Integration (Riverpod)

```dart
// lib/application/providers/database_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart';
import '../../data/database/app_database.dart';
import '../../data/database/daos/inventory_dao.dart';
import '../../data/repositories/inventory_repository.dart';

// Database provider (singleton)
final databaseProvider = Provider<AppDatabase>((ref) {
  return AppDatabase(_openConnection());
});

// DAO providers
final inventoryDaoProvider = Provider<InventoryDao>((ref) {
  final db = ref.watch(databaseProvider);
  return InventoryDao(db);
});

// Repository providers
final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  final dao = ref.watch(inventoryDaoProvider);
  return InventoryRepository(dao);
});

// ============================================================================
// STREAM PROVIDERS (for UI)
// ============================================================================

// Watch user's items
final userItemsProvider = StreamProvider.family<
  List<InventoryItemWithDetails>,
  String
>((ref, userId) {
  final repository = ref.watch(inventoryRepositoryProvider);
  return repository.watchUserItems(userId: userId);
});

// Watch single item
final itemProvider = StreamProvider.family<
  InventoryItem?,
  String
>((ref, itemId) {
  final dao = ref.watch(inventoryDaoProvider);
  return dao.watchItemById(itemId);
});

// User statistics
final userStatsProvider = FutureProvider.family<
  UserInventoryStats,
  String
>((ref, userId) async {
  final dao = ref.watch(inventoryDaoProvider);
  return await dao.getUserStats(userId);
});
```

---

## Testing

### Unit Tests for DAOs

```dart
// test/data/database/daos/inventory_dao_test.dart

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:all_my_things/data/database/app_database.dart';

void main() {
  late AppDatabase db;
  late InventoryDao dao;

  setUp(() {
    // Create in-memory database for testing
    db = AppDatabase(NativeDatabase.memory());
    dao = InventoryDao(db);
  });

  tearDown(() async {
    await db.close();
  });

  group('InventoryDao', () {
    test('createItem inserts item successfully', () async {
      // Arrange
      final item = InventoryItemsCompanion.insert(
        userId: 'test-user',
        title: 'Test Item',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      );

      // Act
      final itemId = await dao.createItem(item);

      // Assert
      expect(itemId, isNotEmpty);

      final retrieved = await dao.getItemById(itemId);
      expect(retrieved, isNotNull);
      expect(retrieved!.title, 'Test Item');
    });

    test('getUserItems returns only user items', () async {
      // Arrange
      await dao.createItem(InventoryItemsCompanion.insert(
        userId: 'user-1',
        title: 'Item 1',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ));

      await dao.createItem(InventoryItemsCompanion.insert(
        userId: 'user-2',
        title: 'Item 2',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ));

      // Act
      final user1Items = await dao.getUserItems(userId: 'user-1');
      final user2Items = await dao.getUserItems(userId: 'user-2');

      // Assert
      expect(user1Items.length, 1);
      expect(user1Items[0].title, 'Item 1');
      expect(user2Items.length, 1);
      expect(user2Items[0].title, 'Item 2');
    });

    test('softDeleteItem marks item as deleted', () async {
      // Arrange
      final itemId = await dao.createItem(InventoryItemsCompanion.insert(
        userId: 'test-user',
        title: 'Test Item',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ));

      // Act
      await dao.softDeleteItem(itemId);

      // Assert
      final item = await dao.getItemById(itemId);
      expect(item!.deletedAt, isNotNull);

      final userItems = await dao.getUserItems(userId: 'test-user');
      expect(userItems, isEmpty); // Soft-deleted items excluded
    });

    test('searchItems finds items by title', () async {
      // Arrange
      await dao.createItem(InventoryItemsCompanion.insert(
        userId: 'test-user',
        title: 'Office Chair',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ));

      await dao.createItem(InventoryItemsCompanion.insert(
        userId: 'test-user',
        title: 'Kitchen Table',
        createdAt: DateTime.now().millisecondsSinceEpoch,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ));

      // Act
      final results = await dao.searchItems(
        userId: 'test-user',
        query: 'chair',
      ).first;

      // Assert
      expect(results.length, 1);
      expect(results[0].title, 'Office Chair');
    });
  });
}
```

---

## Best Practices

### 1. Use Companions for Inserts/Updates

```dart
// GOOD: Use companions (type-safe, prevents missing fields)
final item = InventoryItemsCompanion.insert(
  userId: 'user-1',
  title: 'Chair',
  createdAt: DateTime.now().millisecondsSinceEpoch,
  updatedAt: DateTime.now().millisecondsSinceEpoch,
);

// BAD: Don't construct entities directly
final item = InventoryItem(
  id: 'some-id',  // Might forget fields
  userId: 'user-1',
  title: 'Chair',
  // ... easy to miss required fields
);
```

### 2. Use Streams for Reactive UI

```dart
// GOOD: Reactive updates
final itemsStream = dao.watchUserItems(userId: userId);

StreamBuilder<List<InventoryItem>>(
  stream: itemsStream,
  builder: (context, snapshot) {
    if (snapshot.hasData) {
      return ItemList(items: snapshot.data!);
    }
    return LoadingSpinner();
  },
);

// BAD: Manual polling
Future<void> refreshItems() async {
  final items = await dao.getUserItems(userId: userId);
  setState(() => _items = items);
}
```

### 3. Batch Operations for Performance

```dart
// GOOD: Single batch operation
await dao.createItems([item1, item2, item3]);

// BAD: Multiple individual inserts
for (final item in items) {
  await dao.createItem(item);
}
```

### 4. Use Transactions for Multi-Step Operations

```dart
// GOOD: Atomic transaction
await db.transaction(() async {
  final itemId = await dao.createItem(item);
  await dao.createItemLabel(ItemLabelsCompanion.insert(
    itemId: itemId,
    labelId: labelId,
  ));
  await dao.createItemImage(image);
});

// BAD: Separate operations (can fail mid-way)
final itemId = await dao.createItem(item);
await dao.createItemLabel(...);  // Could fail, leaving orphaned item
await dao.createItemImage(...);
```

---

## Migration Examples

See `/docs/database-migration-strategy.md` for detailed migration procedures.

### Simple Migration (Add Column)

```dart
// In app_database.dart
@override
int get schemaVersion => 2;  // Increment version

@override
MigrationStrategy get migration => MigrationStrategy(
  onUpgrade: (m, from, to) async {
    if (from < 2) {
      await m.addColumn(inventoryItems, inventoryItems.warrantyExpiryDate);
    }
  },
);
```

---

## Performance Tips

1. **Use indexes**: Add indexes for frequently queried columns
2. **Limit results**: Always use `limit()` for lists
3. **Batch operations**: Use `batch()` for multiple inserts/updates
4. **Avoid N+1**: Batch load related data instead of querying in loops
5. **Use FTS5**: Full-text search is much faster than `LIKE`
6. **Profile queries**: Enable `logStatements: true` during development

---

## Resources

- [Drift Documentation](https://drift.simonbinder.eu/)
- [Drift Examples](https://github.com/simolus3/drift/tree/develop/examples)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [FTS5 Documentation](https://www.sqlite.org/fts5.html)

---

**Need Help?** Check the docs or reach out to the team!
