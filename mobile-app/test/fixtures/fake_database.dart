import 'package:all_my_things/data/database/app_database.dart';

AppDatabase createFakeDatabase() {
  return AppDatabase.inMemory();
}
