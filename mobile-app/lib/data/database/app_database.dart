import 'dart:io';

import 'package:all_my_things/data/database/tables/categories.dart';
import 'package:all_my_things/data/database/tables/inventory_items.dart';
import 'package:all_my_things/data/database/tables/item_categories.dart';
import 'package:all_my_things/data/database/tables/labels.dart';
import 'package:all_my_things/data/database/tables/label_search_fts.dart';
import 'package:all_my_things/data/database/tables/sync_queue.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// Main database class for the Visual Home Inventory Manager
@DriftDatabase(
  tables: [
    InventoryItems,
    Labels,
    LabelSearchFts,
    Categories,
    ItemCategories,
    SyncQueue,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  AppDatabase.inMemory() : super(_memory());

  factory AppDatabase.atPath(String fullPath) {
    final file = File(fullPath);
    file.parent.createSync(recursive: true);
    return AppDatabase._fromDb(NativeDatabase.createInBackground(file));
  }

  AppDatabase._fromDb(super.e);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async {
          await m.createAll();
          await _createFtsTriggers();
          await _seedDefaultCategories();
          await _createIndexes();
        },
        onUpgrade: (Migrator m, int from, int to) async {
          if (from < 2) {
            // Add new tables for v2
            await m.createTable(labelSearchFts);
            await m.createTable(categories);
            await m.createTable(itemCategories);
            await m.createTable(syncQueue);
            await _createFtsTriggers();
            await _seedDefaultCategories();
            await _createIndexes();
          }
        },
      );

  /// Create triggers to keep FTS table in sync with labels table
  Future<void> _createFtsTriggers() async {
    // Insert trigger
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS label_search_insert AFTER INSERT ON labels
      BEGIN
        INSERT INTO label_search_fts(label_id, value)
        VALUES (NEW.id, NEW.value);
      END;
    ''');

    // Update trigger
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS label_search_update AFTER UPDATE ON labels
      BEGIN
        UPDATE label_search_fts
        SET value = NEW.value
        WHERE label_id = NEW.id;
      END;
    ''');

    // Delete trigger
    await customStatement('''
      CREATE TRIGGER IF NOT EXISTS label_search_delete AFTER DELETE ON labels
      BEGIN
        DELETE FROM label_search_fts WHERE label_id = OLD.id;
      END;
    ''');
  }

  /// Seed default system categories
  Future<void> _seedDefaultCategories() async {
    final systemCategories = [
      ('Kitchen', 'kitchen_set', '#FF6B6B'),
      ('Living Room', 'weekend', '#4ECDC4'),
      ('Bedroom', 'bed', '#45B7D1'),
      ('Bathroom', 'bathroom', '#96CEB4'),
      ('Office', 'computer', '#FFEAA7'),
      ('Electronics', 'devices', '#DDA15E'),
      ('Tools', 'construction', '#BC6C25'),
      ('Clothing', 'checkroom', '#E85D75'),
      ('Books', 'menu_book', '#A8DADC'),
      ('Toys', 'toys', '#F4A261'),
      ('Sports', 'sports_soccer', '#2A9D8F'),
      ('Other', 'category', '#95A3B3'),
    ];

    for (final (name, icon, color) in systemCategories) {
      await into(categories).insert(
        CategoriesCompanion.insert(
          name: name,
          iconName: Value(icon),
          colorHex: Value(color),
          isSystem: const Value(true),
          createdAt: DateTime.now(),
        ),
        mode: InsertMode.insertOrIgnore,
      );
    }
  }

  /// Create performance indexes
  Future<void> _createIndexes() async {
    // Index on inventory items by creation date (for feed ordering)
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_items_created_at ON inventory_items(created_at DESC);',
    );

    // Index on labels by item_id (for label lookups)
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_labels_item_id ON labels(item_id);',
    );

    // Index on labels by value (for search)
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_labels_value ON labels(value);',
    );

    // Index on sync queue by queued_at (for processing order)
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_queued_at ON sync_queue(queued_at);',
    );

    // Index on item_categories for faster joins
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_item_categories_item_id ON item_categories(item_id);',
    );
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_item_categories_category_id ON item_categories(category_id);',
    );
  }

  // ======================================================================
  // Custom Queries - Full-Text Search
  // ======================================================================

  /// Search labels using FTS5 with optional highlighting
  Future<List<Label>> searchLabels(String query) async {
    final escapedQuery = query
        .replaceAll('"', '""')
        .split(' ')
        .where((term) => term.isNotEmpty)
        .map((term) => '"$term"*')
        .join(' OR ');

    if (escapedQuery.isEmpty) return [];

    final results = await customSelect(
      '''
      SELECT l.* FROM labels l
      INNER JOIN label_search_fts fts ON l.id = fts.label_id
      WHERE label_search_fts MATCH ?
      ORDER BY rank
      ''',
      variables: [Variable.withString(escapedQuery)],
      readsFrom: {labels, labelSearchFts},
    ).get();

    return results.map((row) => labels.map(row.data)).toList();
  }

  /// Get items matching search query via FTS
  Future<List<InventoryItem>> searchItems(String query) async {
    final matchingLabels = await searchLabels(query);
    if (matchingLabels.isEmpty) return [];

    final itemIds = matchingLabels.map((l) => l.itemId).toSet().toList();

    return (select(inventoryItems)
          ..where((t) => t.id.isIn(itemIds))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
        .get();
  }

  // ======================================================================
  // Custom Queries - Categories
  // ======================================================================

  /// Get all categories
  Future<List<Category>> getAllCategories() async {
    return (select(categories)..orderBy([(t) => OrderingTerm.asc(t.name)]))
        .get();
  }

  /// Get categories for a specific item
  Future<List<Category>> getCategoriesForItem(int itemId) async {
    final query = select(categories).join([
      innerJoin(
        itemCategories,
        itemCategories.categoryId.equalsExp(categories.id),
      ),
    ])
      ..where(itemCategories.itemId.equals(itemId));

    final results = await query.get();
    return results.map((row) => row.readTable(categories)).toList();
  }

  /// Add category to item
  Future<void> addCategoryToItem(int itemId, int categoryId) async {
    await into(itemCategories).insert(
      ItemCategoriesCompanion.insert(
        itemId: itemId,
        categoryId: categoryId,
        createdAt: DateTime.now(),
      ),
      mode: InsertMode.insertOrIgnore,
    );
  }

  /// Remove category from item
  Future<void> removeCategoryFromItem(int itemId, int categoryId) async {
    await (delete(itemCategories)
          ..where((t) => t.itemId.equals(itemId) & t.categoryId.equals(categoryId)))
        .go();
  }

  // ======================================================================
  // Custom Queries - Sync Queue
  // ======================================================================

  /// Get pending sync items
  Future<List<SyncQueueItem>> getPendingSyncItems() async {
    return (select(syncQueue)
          ..orderBy([(t) => OrderingTerm.asc(t.queuedAt)]))
        .get();
  }

  /// Add item to sync queue
  Future<int> addToSyncQueue(int itemId, String operation) async {
    return into(syncQueue).insert(
      SyncQueueCompanion.insert(
        itemId: itemId,
        operation: operation,
        queuedAt: DateTime.now(),
      ),
    );
  }

  /// Update sync queue item after attempt
  Future<void> updateSyncAttempt(
    int queueId,
    String? error,
  ) async {
    // Fetch current retry count
    final item = await (select(syncQueue)
          ..where((t) => t.id.equals(queueId)))
        .getSingleOrNull();

    if (item == null) return;

    final newRetryCount = (item.retryCount ?? 0) + 1;

    await (update(syncQueue)..where((t) => t.id.equals(queueId))).write(
      SyncQueueCompanion(
        retryCount: Value(newRetryCount),
        lastError: Value(error),
        lastAttemptAt: Value(DateTime.now()),
      ),
    );
  }

  /// Remove item from sync queue (after successful sync)
  Future<void> removeFromSyncQueue(int queueId) async {
    await (delete(syncQueue)..where((t) => t.id.equals(queueId))).go();
  }
}

/// Opens a connection to the database
LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'home_inventory.db'));
    return NativeDatabase.createInBackground(file);
  });
}

QueryExecutor _memory() => NativeDatabase.memory();
