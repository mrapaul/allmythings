import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Opens a connection to a database backed by a native file on disk
LazyDatabase openConnection() {
  return LazyDatabase(() async {
    // Get the application documents directory
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'home_inventory.sqlite'));

    return NativeDatabase(file);
  });
}
