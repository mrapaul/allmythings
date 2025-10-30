import 'package:drift/drift.dart';

/// Virtual table for full-text search on label values using SQLite FTS5
@DataClassName('LabelSearchEntry')
class LabelSearchFts extends Table with VirtualTableMixin {
  /// Label value indexed for full-text search
  TextColumn get value => text()();

  /// Reference to labels(id) for result joining (not indexed for FTS)
  IntColumn get labelId => integer()();

  @override
  String get moduleAndArgs =>
      'fts5(value, labelId UNINDEXED, tokenize="porter unicode61 remove_diacritics 1")';
}
