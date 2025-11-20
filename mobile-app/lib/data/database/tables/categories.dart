import 'package:drift/drift.dart';

/// Table for predefined and custom categories
@DataClassName('Category')
class Categories extends Table {
  /// Primary key
  IntColumn get id => integer().autoIncrement()();

  /// Category name (e.g., "Kitchen", "Living Room", "Electronics")
  TextColumn get name => text().withLength(min: 1, max: 100)();

  /// Optional icon name for UI
  TextColumn get iconName => text().nullable()();

  /// Color hex code for UI (e.g., "#FF5733")
  TextColumn get colorHex => text().nullable()();

  /// Whether this is a system-defined category
  BoolColumn get isSystem => boolean().withDefault(const Constant(false))();

  /// Timestamp when created
  DateTimeColumn get createdAt => dateTime()();

  @override
  List<String> get customConstraints => [
        'UNIQUE(name)',
      ];
}
