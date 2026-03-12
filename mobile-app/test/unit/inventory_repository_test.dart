import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:flutter_test/flutter_test.dart';

import '../fixtures/fake_database.dart';
import '../fixtures/mock_data.dart';

void main() {
  late AppDatabase database;
  late InventoryRepository repository;

  setUp(() {
    database = createFakeDatabase();
    repository = InventoryRepository(database);
  });

  tearDown(() async {
    await database.close();
  });

  group('InventoryRepository', () {
    test('saveDetection should save item and extract labels', () async {
      final id = await repository.saveDetection(
        photoPath: '/test/photo.jpg',
        thumbnailPath: '/test/thumb.jpg',
        detection: sampleDetectedObject,
      );

      expect(id, isNotNull);

      final item = await repository.getItemById(id);
      expect(item?.photoPath, '/test/photo.jpg');

      final labels = await repository.getLabelsForItem(id);
      // label, category, brand, model, 2 colors, 2 materials, condition, description = 10 labels
      expect(labels.length, 10);
      
      final labelValues = labels.map((l) => l.value).toList();
      expect(labelValues, contains('IKEA BILLY bookcase'));
      expect(labelValues, contains('living room furniture'));
      expect(labelValues, contains('IKEA'));
    });

    test('getAllItems should return items in descending order', () async {
      await repository.saveDetection(
        photoPath: '1',
        thumbnailPath: '1',
        detection: sampleDetectedObject,
      );
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      await repository.saveDetection(
        photoPath: '2',
        thumbnailPath: '2',
        detection: sampleDetectedObject,
      );

      final items = await repository.getAllItems();
      expect(items.length, 2);
      expect(items[0].photoPath, '2');
      expect(items[1].photoPath, '1');
    });

    test('deleteItem should remove item and its labels', () async {
      final id = await repository.saveDetection(
        photoPath: 'test',
        thumbnailPath: 'test',
        detection: sampleDetectedObject,
      );

      await repository.deleteItem(id);

      final item = await repository.getItemById(id);
      expect(item, isNull);

      final labels = await repository.getLabelsForItem(id);
      expect(labels, isEmpty);
    });

    test('getStats should return correct counts', () async {
      await repository.saveDetection(
        photoPath: 'test',
        thumbnailPath: 'test',
        detection: sampleDetectedObject,
      );

      final stats = await repository.getStats();
      expect(stats.totalItems, 1);
      expect(stats.totalLabels, 10);
    });
  });
}
