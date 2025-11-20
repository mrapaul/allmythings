import 'package:drift/drift.dart';

/// Virtual table for full-text search on label values using SQLite FTS5
@DataClassName('LabelSearchEntry')
class LabelSearchFts extends Table {
  /// Reference to labels(id) for result joining
  IntColumn get labelId => integer().customConstraint('NOT NULL')();

  /// Label value indexed for full-text search
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {labelId};

  @override
  bool get withoutRowId => true;

  @override
  String? get tableConstraints =>
      'USING fts5(value, label_id UNINDEXED, tokenize="porter unicode61 remove_diacritics 1")';
}
