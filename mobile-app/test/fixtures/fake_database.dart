import 'package:all_my_things/data/database/app_database.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';

/// Creates an in-memory database suitable for unit testing.
/// Foreign keys are enabled via a setup callback so cascade deletes work.
AppDatabase createTestDatabase() {
  final executor = NativeDatabase.memory(
    setup: (rawDb) {
      rawDb.execute('PRAGMA foreign_keys = ON');
    },
  );
  return AppDatabase.fromExecutor(executor);
}
