import 'package:all_my_things/data/database/tables/inventory_items.dart';
import 'package:drift/drift.dart';

/// Table definition for labels attached to inventory items
@DataClassName('Label')
class Labels extends Table {
  /// Primary key
  IntColumn get id => integer().autoIncrement()();

  /// Foreign key to inventory_items.id (now a TEXT sceneId since v6).
  TextColumn get itemId =>
      text().references(InventoryItems, #id, onDelete: KeyAction.cascade)();

  /// Category key (type, color, brand, material, etc.)
  TextColumn get key => text()();

  /// Label value (laptop, black, Apple, bedroom)
  TextColumn get value => text()();

  /// Confidence score from AI detection (0.0–1.0)
  RealColumn get confidence => real().withDefault(const Constant(1))();

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
