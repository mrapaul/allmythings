import 'package:drift/drift.dart';
import 'package:all_my_things/data/database/tables/inventory_items.dart';

/// Table for tracking items pending sync to backend
@DataClassName('SyncQueueItem')
class SyncQueue extends Table {
  /// Primary key
  IntColumn get id => integer().autoIncrement()();

  /// Reference to inventory item
  IntColumn get itemId => integer().references(
        InventoryItems,
        #id,
        onDelete: KeyAction.cascade,
      )();

  /// Type of sync operation: 'create', 'update', 'delete'
  TextColumn get operation => text().withLength(min: 1, max: 10)();

  /// Number of retry attempts
  IntColumn get retryCount => integer().withDefault(const Constant(0))();

  /// Last error message (if any)
  TextColumn get lastError => text().nullable()();

  /// Timestamp when queued
  DateTimeColumn get queuedAt => dateTime()();

  /// Timestamp of last sync attempt
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  @override
  List<String> get customConstraints => [
        "CHECK(operation IN ('create', 'update', 'delete'))",
        'CHECK(retry_count >= 0)',
      ];
}
