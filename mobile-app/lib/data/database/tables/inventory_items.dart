import 'package:drift/drift.dart';

/// Table definition for inventory items.
///
/// §5.3 v6: id is the canonical sceneId TEXT primary key (one item ≡ one
/// scene). The previous int autoincrement id + nullable sceneId column
/// have been collapsed into a single TEXT PK.
@DataClassName('InventoryItem')
class InventoryItems extends Table {
  /// Primary key — IS the sceneId from cross_frame_dedup. One row per scene.
  TextColumn get id => text()();

  /// Absolute path to full-resolution photo
  TextColumn get photoPath => text()();

  /// Absolute path to thumbnail (256x256)
  TextColumn get thumbnailPath => text()();

  /// URL to the photo on the Mac server (e.g., /photos/uuid.jpg)
  TextColumn get serverPhotoUrl => text().nullable()();

  /// JSON: detection metadata (bounding boxes, confidence, etc.)
  TextColumn get detectionData => text()();

  /// Processing status (pending, completed, failed, flagged).
  TextColumn get status => text().withDefault(const Constant('completed'))();

  /// True when self_diagnosis flagged the run (empty_detection_set,
  /// single_source_run, or diagnosis_budget_exhausted).
  BoolColumn get isFlagged => boolean().withDefault(const Constant(false))();

  /// Timestamp when item was created
  DateTimeColumn get createdAt => dateTime()();

  /// Timestamp when item was last modified
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<String> get customConstraints => [
        'CHECK(length(trim(id)) > 0)',
        'CHECK(length(trim(photo_path)) > 0)',
        'CHECK(length(trim(thumbnail_path)) > 0)',
        'CHECK(length(trim(detection_data)) > 0)',
      ];
}
