import 'package:all_my_things/data/database/tables/inventory_items.dart';
import 'package:drift/drift.dart';

/// Table for storing multiple images per inventory item
/// Each item can have up to 5 images of different types:
/// - 'bounded': Original image with bounding box overlay
/// - 'cropped': Cropped cutout of the detected object
/// - 'user': Additional images added by user
@DataClassName('ItemImage')
class ItemImages extends Table {
  /// Primary key
  IntColumn get id => integer().autoIncrement()();

  /// Foreign key to inventory item
  IntColumn get itemId => integer().references(InventoryItems, #id)();

  /// Local path to the stored image
  TextColumn get localPath => text()();

  /// Type of image: 'bounded', 'cropped', 'user'
  TextColumn get imageType => text().withDefault(const Constant('user'))();

  /// Whether this is the primary/display image
  BoolColumn get isPrimary => boolean().withDefault(const Constant(false))();

  /// Display order (0-4)
  IntColumn get displayOrder => integer().withDefault(const Constant(0))();

  /// When the image was added
  DateTimeColumn get createdAt => dateTime()();

  @override
  List<String> get customConstraints => [
        'CHECK(length(trim(local_path)) > 0)',
        "CHECK(image_type IN ('bounded', 'cropped', 'user'))",
        'CHECK(display_order >= 0 AND display_order < 5)',
      ];
}
