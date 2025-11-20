import 'package:all_my_things/data/database/app_database.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for the main database instance (async to prevent UI thread blocking)
final databaseProvider = FutureProvider<AppDatabase>((ref) async {
  return AppDatabase();
});
