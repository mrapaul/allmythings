import 'package:drift/drift.dart';
import 'inventory_items.dart';

/// Table definition for labels attached to inventory items
@DataClassName('Label')
class Labels extends Table {
  /// Primary key
  IntColumn get id => integer().autoIncrement()();

  /// Foreign key to inventory_items table
  IntColumn get itemId => integer().references(InventoryItems, #id, onDelete: KeyAction.cascade)();

  /// Optional category (type, color, brand, room)
  TextColumn get key => text().nullable()();

  /// Label value (laptop, black, Apple, bedroom)
  TextColumn get value => text()();

  /// Timestamp when label was added
  DateTimeColumn get createdAt => dateTime()();

  @override
  List<Set<Column>> get uniqueKeys => [
    {itemId, key, value}, // Prevent duplicate labels
  ];

  @override
  List<String> get customConstraints => [
    'CHECK(length(trim(value)) > 0)', // No empty values
    'CHECK(length(value) <= 100)', // Max length
  ];
}
