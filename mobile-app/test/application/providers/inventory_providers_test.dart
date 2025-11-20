import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../fixtures/mock_data.dart';

class MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('InventoryItemsProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should return list of inventory items',
      () async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(3);
        when(() => mockRepository.getAll()).thenAnswer((_) async => items);

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(inventoryItemsProvider.future);

        // Assert
        expect(result, equals(items));
        expect(result.length, equals(3));
        verify(() => mockRepository.getAll()).called(1);
      },
    );

    test(
      'should handle empty inventory',
      () async {
        // Arrange
        when(() => mockRepository.getAll()).thenAnswer((_) async => []);

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(inventoryItemsProvider.future);

        // Assert
        expect(result, isEmpty);
      },
    );

    test(
      'should handle repository error',
      () async {
        // Arrange
        when(() => mockRepository.getAll()).thenThrow(
          Exception('Database error'),
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act & Assert
        expect(
          () => container.read(inventoryItemsProvider.future),
          throwsException,
        );
      },
    );

    test(
      'should refresh when invalidated',
      () async {
        // Arrange
        final items1 = MockDataFactory.createInventoryItems(2);
        final items2 = MockDataFactory.createInventoryItems(3);

        when(() => mockRepository.getAll())
            .thenAnswer((_) async => items1)
            .thenAnswer((_) async => items2);

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result1 = await container.read(inventoryItemsProvider.future);
        container.invalidate(inventoryItemsProvider);
        final result2 = await container.read(inventoryItemsProvider.future);

        // Assert
        expect(result1.length, equals(2));
        expect(result2.length, equals(3));
      },
    );
  });

  group('SearchInventoryProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should filter items by search query',
      () async {
        // Arrange
        final items = [
          MockDataFactory.createInventoryItem(
            id: 1,
            label: 'lamp',
          ),
          MockDataFactory.createInventoryItem(
            id: 2,
            label: 'chair',
          ),
        ];
        when(() => mockRepository.search('lamp')).thenAnswer(
          (_) async => [items[0]],
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          searchInventoryProvider('lamp').future,
        );

        // Assert
        expect(result.length, equals(1));
        expect(result.first.label, equals('lamp'));
      },
    );

    test(
      'should return empty list for no matches',
      () async {
        // Arrange
        when(() => mockRepository.search('nonexistent')).thenAnswer(
          (_) async => [],
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          searchInventoryProvider('nonexistent').future,
        );

        // Assert
        expect(result, isEmpty);
      },
    );

    test(
      'should be case-insensitive',
      () async {
        // Arrange
        final item = MockDataFactory.createInventoryItem(
          label: 'Lamp',
        );
        when(() => mockRepository.search('lamp')).thenAnswer(
          (_) async => [item],
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          searchInventoryProvider('lamp').future,
        );

        // Assert
        expect(result.length, equals(1));
      },
    );
  });

  group('ItemDetailProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should fetch item by ID',
      () async {
        // Arrange
        final item = MockDataFactory.createInventoryItem(id: 1);
        when(() => mockRepository.getById(1)).thenAnswer(
          (_) async => item,
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          itemDetailProvider(1).future,
        );

        // Assert
        expect(result, equals(item));
        expect(result.id, equals(1));
      },
    );

    test(
      'should return null if item not found',
      () async {
        // Arrange
        when(() => mockRepository.getById(999)).thenAnswer(
          (_) async => null,
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          itemDetailProvider(999).future,
        );

        // Assert
        expect(result, isNull);
      },
    );
  });

  group('DeleteItemProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should delete item successfully',
      () async {
        // Arrange
        when(() => mockRepository.delete(1)).thenAnswer(
          (_) async => true,
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          deleteItemProvider(1).future,
        );

        // Assert
        expect(result, isTrue);
        verify(() => mockRepository.delete(1)).called(1);
      },
    );

    test(
      'should handle deletion error',
      () async {
        // Arrange
        when(() => mockRepository.delete(1)).thenThrow(
          Exception('Delete failed'),
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act & Assert
        expect(
          () => container.read(deleteItemProvider(1).future),
          throwsException,
        );
      },
    );
  });

  group('CreateItemProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should create new item',
      () async {
        // Arrange
        final newItem = MockDataFactory.createInventoryItem(
          label: 'new_item',
        );
        when(() => mockRepository.create(any())).thenAnswer(
          (_) async => 1,
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          createItemProvider(newItem).future,
        );

        // Assert
        expect(result, equals(1));
      },
    );
  });

  group('UpdateItemProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should update existing item',
      () async {
        // Arrange
        final item = MockDataFactory.createInventoryItem(
          id: 1,
          label: 'updated_label',
        );
        when(() => mockRepository.update(any())).thenAnswer(
          (_) async => true,
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final result = await container.read(
          updateItemProvider(item).future,
        );

        // Assert
        expect(result, isTrue);
      },
    );
  });

  group('FilteredInventoryProvider Tests', () {
    late MockInventoryRepository mockRepository;

    setUp(() {
      mockRepository = MockInventoryRepository();
    });

    test(
      'should filter items by location',
      () async {
        // Arrange
        final items = [
          MockDataFactory.createInventoryItem(
            id: 1,
            location: 'bedroom',
          ),
          MockDataFactory.createInventoryItem(
            id: 2,
            location: 'living_room',
          ),
        ];
        when(() => mockRepository.getAll()).thenAnswer(
          (_) async => items,
        );

        final container = ProviderContainer(
          overrides: [
            inventoryRepositoryProvider
                .overrideWithValue(mockRepository),
          ],
        );

        // Act
        final allItems = await container.read(inventoryItemsProvider.future);

        // Assert
        expect(allItems.length, equals(2));
      },
    );
  });
}
