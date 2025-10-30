import 'package:flutter_test/flutter_test.dart';
import 'package:fpdart/fpdart.dart' show right, left;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:home_inventory/application/providers/inventory_providers.dart';
import 'package:home_inventory/data/repositories/inventory_repository.dart';
import 'package:home_inventory/data/database/app_database.dart';


import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'inventory_providers_test.mocks.dart';

@GenerateMocks([InventoryRepository])
void main() {
  group('InventoryListNotifier', () {
    late MockInventoryRepository mockRepository;
    late ProviderContainer container;

    setUp(() {
      mockRepository = MockInventoryRepository();
      container = ProviderContainer(
        overrides: [
          inventoryRepositoryProvider.overrideWithValue(mockRepository),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    /*test('build returns initial list of items', () async {
      final items = [
        InventoryItem(
          id: 1,
          photoPath: 'path/to/photo1.jpg',
          thumbnailPath: 'path/to/thumb1.jpg',
          detectionData: '{"label": "item1"}',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
      ];
      when(mockRepository.getAllItems()).thenAnswer((_) async => right(items));

      final notifier = container.read(inventoryItemsProvider.notifier);
      await notifier.build();

      container.read(inventoryItemsProvider).when(
            data: (value) => expect(value, equals(items)),
            loading: () => fail('Should not be loading'),
            error: (error, stackTrace) => fail('Should not have an error: $error'),
          );
      verify(mockRepository.getAllItems()).called(1);
    });*/

    // test('build returns empty list on error', () async {
    //   // when(mockRepository.getAllItems())
    //   //     .thenAnswer((_) async => left(const Failure.storage(message: 'Error')));

    //   final notifier = container.read(inventoryItemsProvider.notifier);
    //   // await notifier.build();

    //   // expect(container.read(inventoryItemsProvider).value, isEmpty);
    //   // verify(mockRepository.getAllItems()).called(1);
    // });

    // test('addItemFromDetection adds items successfully', () async {
    //   final detection = Detection(
    //     id: 'det1',
    //     label: 'Chair',
    //     confidence: 0.9,
    //     boundingBox: BoundingBox(x: 0, y: 0, width: 10, height: 10),
    //     ensembleDetails: EnsembleDetails(
    //         providerAgreement: 2,
    //         confidenceByProvider: {},
    //         labelConsensus: 'Chair'),
    //     alternativeLabels: [],
    //   );

    //   final newItem = InventoryItem(
    //     id: 1,
    //     photoPath: 'path/to/new_image.jpg',
    //     thumbnailPath: 'path/to/new_image.jpg',
    //     detectionData: detection.toJsonString(),
    //     createdAt: DateTime.now(),
    //     updatedAt: DateTime.now(),
    //   );

    //   // when(mockRepository.createItem(
    //   //   photoPath: anyNamed('photoPath'),
    //   //   thumbnailPath: anyNamed('thumbnailPath'),
    //   //   detection: anyNamed('detection'),
    //   // )).thenAnswer((_) async => right(1));
    //   // when(mockRepository.getAllItems()).thenAnswer((_) async => right([newItem]));

    //   final notifier = container.read(inventoryItemsProvider.notifier);
    //   // await notifier.addItemFromDetection(
    //   //   photoPath: 'path/to/new_image.jpg',
    //   //   thumbnailPath: 'path/to/new_image.jpg',
    //   //   detection: detection,
    //   // );

    //   // expect(container.read(inventoryItemsProvider).value, equals([newItem]));
    //   // verify(mockRepository.createItem(
    //   //   photoPath: anyNamed('photoPath'),
    //   //   thumbnailPath: anyNamed('thumbnailPath'),
    //   //   detection: anyNamed('detection'),
    //   // )).called(1);
    //   // verify(mockRepository.getAllItems()).called(1);
    // });

    // test('addItemFromDetection handles error during addition', () async {
    //   final detection = Detection(
    //     id: 'det1',
    //     label: 'Chair',
    //     confidence: 0.9,
    //     boundingBox: BoundingBox(x: 0, y: 0, width: 10, height: 10),
    //     ensembleDetails: EnsembleDetails(
    //         providerAgreement: 2,
    //         confidenceByProvider: {},
    //         labelConsensus: 'Chair'),
    //     alternativeLabels: [],
    //   );

    //   // when(mockRepository.createItem(
    //   //   photoPath: anyNamed('photoPath'),
    //   //   thumbnailPath: anyNamed('thumbnailPath'),
    //   //   detection: anyNamed('detection'),
    //   // )).thenAnswer((_) async => left(const Failure.storage(message: 'Add error')));
    //   // when(mockRepository.getAllItems()).thenAnswer((_) async => right([])); // Initial state

    //   final notifier = container.read(inventoryItemsProvider.notifier);
    //   // await notifier.addItemFromDetection(
    //   //   photoPath: 'path/to/new_image.jpg',
    //   //   thumbnailPath: 'path/to/new_image.jpg',
    //   //   detection: detection,
    //   // );

    //   // expect(container.read(inventoryItemsProvider).hasError, isTrue);
    //   // expect(container.read(inventoryItemsProvider).error, isA<Exception>());
    //   // verify(mockRepository.createItem(
    //   //   photoPath: anyNamed('photoPath'),
    //   //   thumbnailPath: anyNamed('thumbnailPath'),
    //   //   detection: anyNamed('detection'),
    //   // )).called(1);
    //   // verifyNever(mockRepository.getAllItems()); // Should not call getAllItems on add failure
    // });
  });
}
