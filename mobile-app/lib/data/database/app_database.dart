import 'dart:io';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'tables/inventory_items.dart';
import 'tables/labels.dart';
// import 'tables/label_search_fts.dart'; // Temporarily disabled

part 'app_database.g.dart';

/// Main database class for the Visual Home Inventory Manager
@DriftDatabase(
  tables: [InventoryItems, Labels], // Removed LabelSearchFts temporarily
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async {
          await m.createAll();
          // await _createFtsTriggers(); // Disabled - no FTS for now
        },
        onUpgrade: (Migrator m, int from, int to) async {
          // Future migrations will go here
        },
      );

  /// Create triggers to keep FTS table in sync with labels table
  Future<void> _createFtsTriggers() async {
    // Insert trigger
    await customStatement('''
      CREATE TRIGGER label_search_insert AFTER INSERT ON labels
      BEGIN
        INSERT INTO label_search_fts(value, labelId)
        VALUES (NEW.value, NEW.id);
      END;
    ''');

    // Update trigger
    await customStatement('''
      CREATE TRIGGER label_search_update AFTER UPDATE ON labels
      BEGIN
        UPDATE label_search_fts
        SET value = NEW.value
        WHERE labelId = NEW.id;
      END;
    ''');

    // Delete trigger
    await customStatement('''
      CREATE TRIGGER label_search_delete AFTER DELETE ON labels
      BEGIN
        DELETE FROM label_search_fts WHERE labelId = OLD.id;
      END;
    ''');
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
