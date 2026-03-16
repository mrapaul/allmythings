import 'package:drift/drift.dart';

/// Virtual table for full-text search on label keys and values using SQLite FTS5
@DataClassName('LabelSearchEntry')
class LabelSearchFts extends Table {
  /// Reference to labels(id) for result joining
  IntColumn get labelId => integer().customConstraint('NOT NULL')();

  /// Label key (e.g., 'type', 'color')
  TextColumn get key => text()();

  /// Label value indexed for full-text search
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {labelId};

  @override
  bool get withoutRowId => true;

  String? get tableConstraints =>
      'USING fts5(key, value, label_id UNINDEXED, tokenize="porter unicode61 remove_diacritics 1")';
}
