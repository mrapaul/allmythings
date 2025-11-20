import 'package:drift/drift.dart';
import 'package:drift/web.dart';

/// Opens a connection to a database backed by IndexedDB for web platform
LazyDatabase openConnection() {
  return LazyDatabase(() async {
    return WebDatabase('home_inventory_db');
  });
}
