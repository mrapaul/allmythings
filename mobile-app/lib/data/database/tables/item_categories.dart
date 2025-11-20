import 'package:drift/drift.dart';
import 'inventory_items.dart';
import 'categories.dart';

/// Junction table linking items to categories (many-to-many)
@DataClassName('ItemCategory')
class ItemCategories extends Table {
  /// Reference to inventory item
  IntColumn get itemId => integer().references(
        InventoryItems,
        #id,
        onDelete: KeyAction.cascade,
      )();

  /// Reference to category
  IntColumn get categoryId => integer().references(
        Categories,
        #id,
        onDelete: KeyAction.cascade,
      )();

  /// Timestamp when association was created
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {itemId, categoryId};
}
