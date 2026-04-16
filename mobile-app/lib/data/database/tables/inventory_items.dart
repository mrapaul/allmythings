import 'package:drift/drift.dart';

/// Table definition for inventory items
@DataClassName('InventoryItem')
class InventoryItems extends Table {
  /// Primary key
  IntColumn get id => integer().autoIncrement()();

  /// Absolute path to full-resolution photo
  TextColumn get photoPath => text()();

  /// Absolute path to thumbnail (256x256)
  TextColumn get thumbnailPath => text()();

  /// URL to the photo on the Mac server (e.g., /photos/uuid.jpg)
  TextColumn get serverPhotoUrl => text().nullable()();

  /// JSON: detection metadata (bounding boxes, confidence, etc.)
  TextColumn get detectionData => text()();

  /// Processing status (pending, completed, failed)
  TextColumn get status => text().withDefault(const Constant('completed'))();

  /// Timestamp when item was created
  DateTimeColumn get createdAt => dateTime()();

  /// Timestamp when item was last modified
  DateTimeColumn get updatedAt => dateTime()();

  @override
  List<String> get customConstraints => [
    'CHECK(length(trim(photo_path)) > 0)',
    'CHECK(length(trim(thumbnail_path)) > 0)',
    'CHECK(length(trim(detection_data)) > 0)',
  ];
}
