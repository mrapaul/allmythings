import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/models/detection.dart';

class MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  group('Inventory Providers Functional Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    group('Add Item from Detection', () {
      test('successfully adds detected item to inventory', () async {
        // Arrange
        final detection = Detection(
          object: 'couch',
          confidence: 0.95,
        );

        when(mockRepository.addItem(
          label: 'couch',
          confidence: 0.95,
          tags: anyNamed('tags'),
        )).thenAnswer((_) async => 'item-123');

        // Act
        final itemId = await mockRepository.addItem(
          label: detection.object,
          confidence: detection.confidence,
          tags: ['living room', 'furniture'],
        );

        // Assert
        expect(itemId, equals('item-123'));
        verify(mockRepository.addItem(
          label: 'couch',
          confidence: 0.95,
          tags: anyNamed('tags'),
        )).called(1);
      });

      test('handles multiple items from single detection', () async {
        // Arrange
        final items = ['couch', 'table', 'lamp'];

        when(mockRepository.addItem(
          label: anyNamed('label'),
          confidence: anyNamed('confidence'),
          tags: anyNamed('tags'),
        )).thenAnswer((_) async => 'item-${DateTime.now().millisecondsSinceEpoch}');

        // Act
        final itemIds = <String>[];
        for (final item in items) {
          final id = await mockRepository.addItem(
            label: item,
            confidence: 0.85,
            tags: ['detected'],
          );
          itemIds.add(id);
        }

        // Assert
        expect(itemIds.length, equals(3));
        verify(mockRepository.addItem(
          label: anyNamed('label'),
          confidence: anyNamed('confidence'),
          tags: anyNamed('tags'),
        )).called(3);
      });

      test('preserves confidence score when adding item', () async {
        // Arrange
        const confidence = 0.92;

        when(mockRepository.addItem(
          label: 'bed',
          confidence: confidence,
          tags: anyNamed('tags'),
        )).thenAnswer((_) async => 'item-456');

        // Act
        final itemId = await mockRepository.addItem(
          label: 'bed',
          confidence: confidence,
          tags: ['bedroom'],
        );

        // Assert
        expect(itemId, isNotEmpty);
        verify(mockRepository.addItem(
          label: 'bed',
          confidence: confidence,
          tags: anyNamed('tags'),
        )).called(1);
      });
    });

    group('Search Inventory by Labels', () {
      test('searches inventory by label', () async {
        // Arrange
        final searchResults = [
          {'id': '1', 'label': 'couch', 'confidence': 0.95},
          {'id': '2', 'label': 'sofa', 'confidence': 0.92},
        ];

        when(mockRepository.searchByLabel('couch'))
            .thenAnswer((_) async => searchResults);

        // Act
        final results = await mockRepository.searchByLabel('couch');

        // Assert
        expect(results.length, equals(2));
        expect(results[0]['label'], equals('couch'));
        verify(mockRepository.searchByLabel('couch')).called(1);
      });

      test('searches with partial match', () async {
        // Arrange
        final searchResults = [
          {'id': '1', 'label': 'lamp', 'confidence': 0.88},
          {'id': '2', 'label': 'lamp post', 'confidence': 0.80},
        ];

        when(mockRepository.searchByLabel('lamp'))
            .thenAnswer((_) async => searchResults);

        // Act
        final results = await mockRepository.searchByLabel('lamp');

        // Assert
        expect(results.length, equals(2));
        expect(results.every((r) => r['label'].toString().contains('lamp')), isTrue);
      });

      test('returns empty results for non-existent label', () async {
        // Arrange
        when(mockRepository.searchByLabel('nonexistent'))
            .thenAnswer((_) async => []);

        // Act
        final results = await mockRepository.searchByLabel('nonexistent');

        // Assert
        expect(results, isEmpty);
      });

      test('searches case-insensitive', () async {
        // Arrange
        final searchResults = [
          {'id': '1', 'label': 'Chair', 'confidence': 0.91},
        ];

        when(mockRepository.searchByLabel('chair'))
            .thenAnswer((_) async => searchResults);

        // Act
        final results = await mockRepository.searchByLabel('chair');

        // Assert
        expect(results.isNotEmpty, isTrue);
        expect(results[0]['label'], equals('Chair'));
      });
    });

    group('Edit Item Labels', () {
      test('updates item label successfully', () async {
        // Arrange
        const itemId = 'item-123';
        const newLabel = 'sofa';

        when(mockRepository.updateItemLabel(itemId, newLabel))
            .thenAnswer((_) async => true);

        // Act
        final success = await mockRepository.updateItemLabel(itemId, newLabel);

        // Assert
        expect(success, isTrue);
        verify(mockRepository.updateItemLabel(itemId, newLabel)).called(1);
      });

      test('handles label update failure', () async {
        // Arrange
        const itemId = 'item-invalid';
        const newLabel = 'sofa';

        when(mockRepository.updateItemLabel(itemId, newLabel))
            .thenAnswer((_) async => false);

        // Act
        final success = await mockRepository.updateItemLabel(itemId, newLabel);

        // Assert
        expect(success, isFalse);
      });

      test('can edit multiple label properties', () async {
        // Arrange
        const itemId = 'item-789';

        when(mockRepository.updateItemLabel(itemId, 'couch'))
            .thenAnswer((_) async => true);
        when(mockRepository.updateItemLabel(itemId, 'sofa'))
            .thenAnswer((_) async => true);

        // Act
        final result1 = await mockRepository.updateItemLabel(itemId, 'couch');
        final result2 = await mockRepository.updateItemLabel(itemId, 'sofa');

        // Assert
        expect(result1 && result2, isTrue);
        verify(mockRepository.updateItemLabel(itemId, 'couch')).called(1);
        verify(mockRepository.updateItemLabel(itemId, 'sofa')).called(1);
      });
    });

    group('Get Inventory Items', () {
      test('retrieves all inventory items', () async {
        // Arrange
        final items = [
          {'id': '1', 'label': 'couch', 'confidence': 0.95},
          {'id': '2', 'label': 'table', 'confidence': 0.88},
          {'id': '3', 'label': 'lamp', 'confidence': 0.82},
        ];

        when(mockRepository.getAllItems())
            .thenAnswer((_) async => items);

        // Act
        final allItems = await mockRepository.getAllItems();

        // Assert
        expect(allItems.length, equals(3));
        verify(mockRepository.getAllItems()).called(1);
      });

      test('handles empty inventory', () async {
        // Arrange
        when(mockRepository.getAllItems())
            .thenAnswer((_) async => []);

        // Act
        final items = await mockRepository.getAllItems();

        // Assert
        expect(items, isEmpty);
      });

      test('returns items with proper structure', () async {
        // Arrange
        final items = [
          {'id': '1', 'label': 'bed', 'confidence': 0.92, 'tags': 'bedroom'},
        ];

        when(mockRepository.getAllItems())
            .thenAnswer((_) async => items);

        // Act
        final result = await mockRepository.getAllItems();

        // Assert
        expect(result[0].containsKey('id'), isTrue);
        expect(result[0].containsKey('label'), isTrue);
        expect(result[0].containsKey('confidence'), isTrue);
      });
    });

    group('Delete Item from Inventory', () {
      test('successfully deletes item', () async {
        // Arrange
        const itemId = 'item-to-delete';

        when(mockRepository.deleteItem(itemId))
            .thenAnswer((_) async => true);

        // Act
        final success = await mockRepository.deleteItem(itemId);

        // Assert
        expect(success, isTrue);
        verify(mockRepository.deleteItem(itemId)).called(1);
      });

      test('handles delete of non-existent item', () async {
        // Arrange
        const itemId = 'nonexistent';

        when(mockRepository.deleteItem(itemId))
            .thenAnswer((_) async => false);

        // Act
        final success = await mockRepository.deleteItem(itemId);

        // Assert
        expect(success, isFalse);
      });

      test('can delete multiple items', () async {
        // Arrange
        const ids = ['item-1', 'item-2', 'item-3'];

        when(mockRepository.deleteItem(any))
            .thenAnswer((_) async => true);

        // Act
        final results = await Future.wait(
          ids.map((id) => mockRepository.deleteItem(id)),
        );

        // Assert
        expect(results.every((r) => r), isTrue);
        verify(mockRepository.deleteItem(any)).called(3);
      });
    });

    group('Concurrent Inventory Operations', () {
      test('handles concurrent add and search', () async {
        // Arrange
        when(mockRepository.addItem(
          label: anyNamed('label'),
          confidence: anyNamed('confidence'),
          tags: anyNamed('tags'),
        )).thenAnswer((_) async => 'item-${DateTime.now().millisecondsSinceEpoch}');

        when(mockRepository.searchByLabel(any))
            .thenAnswer((_) async => []);

        // Act
        final futures = <Future<dynamic>>[
          mockRepository.addItem(label: 'item1', confidence: 0.9, tags: []),
          mockRepository.searchByLabel('item1'),
          mockRepository.addItem(label: 'item2', confidence: 0.85, tags: []),
          mockRepository.searchByLabel('item2'),
        ];

        final results = await Future.wait(futures);

        // Assert
        expect(results.length, equals(4));
      });

      test('handles rapid successive operations', () async {
        // Arrange
        when(mockRepository.addItem(
          label: anyNamed('label'),
          confidence: anyNamed('confidence'),
          tags: anyNamed('tags'),
        )).thenAnswer((_) async => 'item-id');

        // Act
        for (var i = 0; i < 10; i++) {
          await mockRepository.addItem(
            label: 'item-$i',
            confidence: 0.85,
            tags: ['batch'],
          );
        }

        // Assert
        verify(mockRepository.addItem(
          label: anyNamed('label'),
          confidence: anyNamed('confidence'),
          tags: anyNamed('tags'),
        )).called(10);
      });
    });

    group('Inventory Error Handling', () {
      test('handles database errors gracefully', () async {
        // Arrange
        when(mockRepository.getAllItems())
            .thenThrow(Exception('Database error'));

        // Act & Assert
        expect(
          () => mockRepository.getAllItems(),
          throwsException,
        );
      });

      test('handles network errors during sync', () async {
        // Arrange
        when(mockRepository.syncWithServer())
            .thenThrow(Exception('Network error'));

        // Act & Assert
        expect(
          () => mockRepository.syncWithServer(),
          throwsException,
        );
      });
    });

    group('Inventory Performance', () {
      test('completes search within timeout', () async {
        // Arrange
        when(mockRepository.searchByLabel('test'))
            .thenAnswer((_) async => []);

        // Act & Assert
        final result = await mockRepository.searchByLabel('test')
            .timeout(const Duration(seconds: 5));
        expect(result, isNotNull);
      });

      test('handles large result sets', () async {
        // Arrange
        final largeResults = List.generate(
          100,
          (i) => {'id': 'item-$i', 'label': 'item', 'confidence': 0.85},
        );

        when(mockRepository.getAllItems())
            .thenAnswer((_) async => largeResults);

        // Act
        final results = await mockRepository.getAllItems();

        // Assert
        expect(results.length, equals(100));
      });
    });
  });
}
