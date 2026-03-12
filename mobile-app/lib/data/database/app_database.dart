import 'dart:io';

import 'package:all_my_things/data/database/tables/inventory_items.dart';
import 'package:all_my_things/data/database/tables/label_search_fts.dart';
import 'package:all_my_things/data/database/tables/labels.dart';
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
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async {
          await m.createAll();
          await _createFtsTriggers();
          await _createIndexes();
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
