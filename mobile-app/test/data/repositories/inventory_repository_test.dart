import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:fpdart/fpdart.dart';
import 'package:drift/drift.dart' hide Column;
import 'package:home_inventory/data/repositories/inventory_repository.dart';
import 'package:home_inventory/data/database/app_database.dart';
import 'package:home_inventory/data/database/tables/inventory_items.dart';
import 'package:home_inventory/data/database/tables/labels.dart';
import 'package:home_inventory/data/database/tables/label_search_fts.dart';
import 'package:home_inventory/domain/models/detection.dart';
import 'package:home_inventory/domain/models/bounding_box.dart';
import 'package:home_inventory/domain/models/ensemble_details.dart';
import 'package:home_inventory/core/errors/failures.dart';
import 'dart:convert';

// Mocks
class MockAppDatabase extends Mock implements AppDatabase {}

class MockInventoryItems extends Mock implements InventoryItems {}

class MockLabels extends Mock implements Labels {}

class MockLabelSearchFts extends Mock implements LabelSearchFts {}

class MockSelectable<T> extends Mock implements Selectable<T> {}

class MockInsertable<T> extends Mock implements Insertable<T> {}

class MockSimpleSelectStatement<T> extends Mock implements SimpleSelectStatement<T> {}

class MockJoinedSelectStatement<T, R> extends Mock implements JoinedSelectStatement<T, R> {}

class MockUpdateStatement<T> extends Mock implements UpdateStatement<T> {}

class MockDeleteStatement<T> extends Mock implements DeleteStatement<T> {}

void main() {
  group('InventoryRepository', () {
    late InventoryRepository repository;
    late MockAppDatabase mockDatabase;

    setUp(() {
      mockDatabase = MockAppDatabase();
      repository = InventoryRepository(mockDatabase);

      // Mock table access
      when(mockDatabase.inventoryItems).thenReturn(MockInventoryItems());
      when(mockDatabase.labels).thenReturn(MockLabels());
      when(mockDatabase.labelSearchFts).thenReturn(MockLabelSearchFts());
    });

    final tDetection = Detection(
      id: 'det1',
      label: 'Chair',
      confidence: 0.9,
      boundingBox: BoundingBox(x: 0, y: 0, width: 10, height: 10),
      ensembleDetails: EnsembleDetails(
          providersUsed: 2,
          providerAgreement: 2,
          labelConsensus: 'Chair'),
      alternativeLabels: [],
    );

    final tInventoryItem = InventoryItem(
      id: 1,
      photoPath: 'path/to/photo.jpg',
      thumbnailPath: 'path/to/thumb.jpg',
      detectionData: tDetection.toJsonString(),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    final tLabel = Label(
      id: 1,
      itemId: 1,
      value: 'Chair',
      createdAt: DateTime.now(),
    );

    group('createItem', () {
      test('should return item ID on successful creation', () async {
        when(mockInto.insert(any)).thenAnswer((_) async => Future.value(1));

        final mockIntoLabels = MockInsertable<LabelsCompanion>();
        when(mockDatabase.into(mockDatabase.labels)).thenReturn(mockIntoLabels);
        when(mockIntoLabels.insert(any)).thenAnswer((_) async => Future.value(1));

        final result = await repository.createItem(
          photoPath: tInventoryItem.photoPath,
          thumbnailPath: tInventoryItem.thumbnailPath,
          detection: tDetection,
        expect(result, const Right<Failure, int>(1));
        verify(mockDatabase.into(mockDatabase.inventoryItems)).called(1);
        verify(mockDatabase.into(mockDatabase.labels)).called(1);
      });

      test('should return Failure on database error', () async {
        final mockInto = MockInsertable<InventoryItemsCompanion>();
        when(mockDatabase.into(any)).thenReturn(mockInto);
        when(mockInto.insert(any)).thenThrow(Exception('DB Error'));

        final result = await repository.createItem(
          photoPath: tInventoryItem.photoPath,
          thumbnailPath: tInventoryItem.thumbnailPath,
          detection: tDetection,
        );

        expect(result, const Left(Failure.storage(message: 'Failed to create inventory item: Exception: DB Error')));
      });
    });

    group('addItems', () {
      test('should return list of item IDs on successful addition', () async {
        final mockInto = MockInsertable<InventoryItemsCompanion>();
        when(mockDatabase.into(mockDatabase.inventoryItems)).thenReturn(mockInto);
        when(mockInto.insert(any)).thenAnswer((_) async => Future.value(1));

        final mockIntoLabels = MockInsertable<LabelsCompanion>();
        when(mockDatabase.into(mockDatabase.labels)).thenReturn(mockIntoLabels);
        when(mockIntoLabels.insert(any)).thenAnswer((_) async => Future.value(1));

        final result = await repository.addItems([tInventoryItem]);

        expect(result, const Right<Failure, List<int>>([1]));
        verify(mockDatabase.into(mockDatabase.inventoryItems)).called(1);
        verify(mockDatabase.into(mockDatabase.labels)).called(1);
      });

      test('should return Failure on database error', () async {
        final mockInto = MockInsertable<InventoryItemsCompanion>();
        when(mockDatabase.into(mockDatabase.inventoryItems)).thenReturn(mockInto);
        when(mockInto.insert(any)).thenThrow(Exception('DB Error'));

        final result = await repository.addItems([tInventoryItem]);

        expect(result, const Left(Failure.storage(message: 'Failed to add inventory items: Exception: DB Error')));
      });
    });

    group('getAllItems', () {
      test('should return list of items', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelect);
        when(mockSelect.orderBy(any)).thenReturn(mockSelect);
        when(mockSelect.get()).thenAnswer((_) async => Right<Failure, List<InventoryItem>>([tInventoryItem]));

        final result = await repository.getAllItems();

        expect(result, Right([tInventoryItem]));
      });

      test('should return empty list if no items', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockSelect.get()).thenAnswer((_) async => Right<Failure, List<InventoryItem>>([]));

        final result = await repository.getAllItems();

        expect(result, const Right([]));
      });

      test('should return Failure on database error', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelect);
        when(mockSelect.orderBy(any)).thenReturn(mockSelect);
        when(mockSelect.get()).thenThrow(Exception('DB Error'));

        final result = await repository.getAllItems();

        expect(result, const Left(Failure.storage(message: 'Failed to get inventory items: Exception: DB Error')));
      });
    });

    group('getItemById', () {
      test('should return item if found', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelect);
        when(mockSelect.where(any)).thenReturn(mockSelect);
        when(mockSelect.getSingleOrNull()).thenAnswer((_) async => Right<Failure, InventoryItem?>(tInventoryItem));

        final result = await repository.getItemById(1);

        expect(result, Right(tInventoryItem));
      });

      test('should return null if item not found', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelect);
        when(mockSelect.where(any)).thenReturn(mockSelect);
        when(mockSelect.getSingleOrNull()).thenAnswer((_) async => Right<Failure, InventoryItem?>(null));

        final result = await repository.getItemById(99);

        expect(result, const Right(null));
      });

      test('should return Failure on database error', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelect);
        when(mockSelect.where(any)).thenReturn(mockSelect);
        when(mockSelect.getSingleOrNull()).thenThrow(Exception('DB Error'));

        final result = await repository.getItemById(1);

        expect(result, const Left(Failure.storage(message: 'Failed to get inventory item: Exception: DB Error')));
      });
    });

    group('deleteItem', () {
      test('should return void on successful deletion', () async {
        final mockDelete = MockDeleteStatement<InventoryItemsCompanion>();
        when(mockDatabase.delete(mockDatabase.inventoryItems)).thenReturn(mockDelete);
        when(mockDelete.where(any)).thenReturn(mockDelete);
        when(mockDelete.go()).thenAnswer((_) async => 1);

        final result = await repository.deleteItem(1);

        expect(result, const Right<Failure, void>(null));
      });

      test('should return Failure on database error', () async {
        final mockDelete = MockDeleteStatement<InventoryItemsCompanion>();
        when(mockDatabase.delete(mockDatabase.inventoryItems)).thenReturn(mockDelete);
        when(mockDelete.where(any)).thenReturn(mockDelete);
        when(mockDelete.go()).thenThrow(Exception('DB Error'));

        final result = await repository.deleteItem(1);

        expect(result, const Left(Failure.storage(message: 'Failed to delete inventory item: Exception: DB Error')));
      });
    });

    group('getLabelsForItem', () {
      test('should return list of labels', () async {
        final mockSelect = MockSimpleSelectStatement<Label>();
        when(mockDatabase.select(mockDatabase.labels)).thenReturn(mockSelect);
        when(mockSelect.where(any)).thenReturn(mockSelect);
        when(mockSelect.orderBy(any)).thenReturn(mockSelect);
        when(mockSelect.get()).thenAnswer((_) async => Right<Failure, List<Label>>([tLabel]));

        final result = await repository.getLabelsForItem(1);

        expect(result, Right([tLabel]));
      });

      test('should return empty list if no labels', () async {
        final mockSelect = MockSimpleSelectStatement<Label>();
        when(mockDatabase.select(mockDatabase.labels)).thenReturn(mockSelect);
        when(mockSelect.where(any)).thenReturn(mockSelect);
        when(mockSelect.orderBy(any)).thenReturn(mockSelect);
        when(mockSelect.get()).thenAnswer((_) async => Right<Failure, List<Label>>([]));

        final result = await repository.getLabelsForItem(1);

        expect(result, const Right([]));
      });

      test('should return Failure on database error', () async {
        final mockSelect = MockSimpleSelectStatement<Label>();
        when(mockDatabase.select(mockDatabase.labels)).thenReturn(mockSelect);
        when(mockSelect.where(any)).thenReturn(mockSelect);
        when(mockSelect.orderBy(any)).thenReturn(mockSelect);
        when(mockSelect.get()).thenThrow(Exception('DB Error'));

        final result = await repository.getLabelsForItem(1);

        expect(result, const Left(Failure.storage(message: 'Failed to get labels: Exception: DB Error')));
      });
    });

    group('searchItems', () {
      test('should return all items if query is empty', () async {
        final mockSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelect);
        when(mockSelect.orderBy(any)).thenReturn(mockSelect);
        when(mockSelect.get()).thenAnswer((_) async => Right<Failure, List<InventoryItem>>([tInventoryItem]));

        final result = await repository.searchItems('');

        expect(result, Right([tInventoryItem]));
        verify(mockRepository.getAllItems()).called(1);
      });

      test('should return list of items matching FTS query', () async {
        final mockFtsSelect = MockSimpleSelectStatement<LabelSearchFtsData>();
        when(mockDatabase.select(mockDatabase.labelSearchFts)).thenReturn(mockFtsSelect);
        when(mockFtsSelect.where(any)).thenReturn(mockFtsSelect);
        when(mockFtsSelect.get()).thenAnswer((_) async => Right<Failure, List<LabelSearchFtsData>>([LabelSearchFtsData(value: 'Chair', labelId: 1)]));

        final mockLabelSelect = MockSimpleSelectStatement<Label>();
        when(mockDatabase.select(mockDatabase.labels)).thenReturn(mockLabelSelect);
        when(mockLabelSelect.where(any)).thenReturn(mockLabelSelect);
        when(mockLabelSelect.get()).thenAnswer((_) async => [tLabel]);

        final mockItemSelect = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockItemSelect);
        when(mockItemSelect.where(any)).thenReturn(mockItemSelect);
        when(mockItemSelect.orderBy(any)).thenReturn(mockItemSelect);
        when(mockItemSelect.get()).thenAnswer((_) async => [tInventoryItem]);

        final result = await repository.searchItems('Chair');

        expect(result, Right([tInventoryItem]));
        verify(mockDatabase.select(mockDatabase.labelSearchFts)).called(1);
        verify(mockDatabase.select(mockDatabase.labels)).called(1);
        verify(mockDatabase.select(mockDatabase.inventoryItems)).called(1);
      });

      test('should return empty list if no FTS results', () async {
        final mockFtsSelect = MockSimpleSelectStatement<LabelSearchFtsData>();
        when(mockDatabase.select(mockDatabase.labelSearchFts)).thenReturn(mockFtsSelect);
        when(mockFtsSelect.where(any)).thenReturn(mockFtsSelect);
        when(mockFtsSelect.get()).thenAnswer((_) async => []);

        final result = await repository.searchItems('NonExistent');

        expect(result, const Right([]));
      });

      test('should return Failure on database error', () async {
        final mockFtsSelect = MockSimpleSelectStatement<LabelSearchFtsData>();
        when(mockDatabase.select(mockDatabase.labelSearchFts)).thenReturn(mockFtsSelect);
        when(mockFtsSelect.where(any)).thenReturn(mockFtsSelect);
        when(mockFtsSelect.get()).thenThrow(Exception('DB Error'));

        final result = await repository.searchItems('Chair');

        expect(result, const Left(Failure.storage(message: 'Failed to search items: Exception: DB Error')));
      });
    });

    group('addLabel', () {
      test('should return label ID on successful addition', () async {
        final mockInto = MockInsertable<LabelsCompanion>();
        when(mockDatabase.into(any)).thenReturn(mockInto);
        when(mockInto.insert(any)).thenAnswer((_) async => 1);

        final result = await repository.addLabel(itemId: 1, value: 'New Label');

        expect(result, const Right(1));
      });

      test('should return Failure on database error', () async {
        final mockInto = MockInsertable<LabelsCompanion>();
        when(mockDatabase.into(any)).thenReturn(mockInto);
        when(mockInto.insert(any)).thenThrow(Exception('DB Error'));

        final result = await repository.addLabel(itemId: 1, value: 'New Label');

        expect(result, const Left(Failure.storage(message: 'Failed to add label: Exception: DB Error')));
      });
    });

    group('updateLabel', () {
      test('should return void on successful update', () async {
        final mockUpdate = MockUpdateStatement<LabelsCompanion>();
        when(mockDatabase.update(any)).thenReturn(mockUpdate);
        when(mockUpdate.where(any)).thenReturn(mockUpdate);
        when(mockUpdate.write(any)).thenAnswer((_) async => 1);

        final result = await repository.updateLabel(labelId: 1, value: 'Updated Label');

        expect(result, const Right(null));
      });

      test('should return Failure on database error', () async {
        final mockUpdate = MockUpdateStatement<LabelsCompanion>();
        when(mockDatabase.update(any)).thenReturn(mockUpdate);
        when(mockUpdate.where(any)).thenReturn(mockUpdate);
        when(mockUpdate.write(any)).thenThrow(Exception('DB Error'));

        final result = await repository.updateLabel(labelId: 1, value: 'Updated Label');

        expect(result, const Left(Failure.storage(message: 'Failed to update label: Exception: DB Error')));
      });
    });

    group('deleteLabel', () {
      test('should return void on successful deletion', () async {
        final mockDelete = MockDeleteStatement<LabelsCompanion>();
        when(mockDatabase.delete(any)).thenReturn(mockDelete);
        when(mockDelete.where(any)).thenReturn(mockDelete);
        when(mockDelete.go()).thenAnswer((_) async => 1);

        final result = await repository.deleteLabel(1);

        expect(result, const Right(null));
      });

      test('should return Failure on database error', () async {
        final mockDelete = MockDeleteStatement<LabelsCompanion>();
        when(mockDatabase.delete(any)).thenReturn(mockDelete);
        when(mockDelete.where(any)).thenReturn(mockDelete);
        when(mockDelete.go()).thenThrow(Exception('DB Error'));

        final result = await repository.deleteLabel(1);

        expect(result, const Left(Failure.storage(message: 'Failed to delete label: Exception: DB Error')));
      });
    });

    group('getStats', () {
      test('should return InventoryStats', () async {
        final mockSelectOnlyItems = MockSelectable<int>();
        when(mockDatabase.selectOnly(mockDatabase.inventoryItems)).thenReturn(mockSelectOnlyItems);
        when(mockSelectOnlyItems.addColumns(any)).thenReturn(mockSelectOnlyItems);
        when(mockSelectOnlyItems.map(any)).thenAnswer((_) => MockSelectable<int>());
        when(mockSelectOnlyItems.getSingle()).thenAnswer((_) async => 5);

        final mockSelectOnlyLabels = MockSelectable<int>();
        when(mockDatabase.selectOnly(mockDatabase.labels)).thenReturn(mockSelectOnlyLabels);
        when(mockSelectOnlyLabels.addColumns(any)).thenReturn(mockSelectOnlyLabels);
        when(mockSelectOnlyLabels.map(any)).thenAnswer((_) => MockSelectable<int>());
        when(mockSelectOnlyLabels.getSingle()).thenAnswer((_) async => 10);

        final mockSelectItems = MockSimpleSelectStatement<InventoryItem>();
        when(mockDatabase.select(mockDatabase.inventoryItems)).thenReturn(mockSelectItems);
        when(mockSelectItems.orderBy(any)).thenReturn(mockSelectItems);
        when(mockSelectItems.limit(any)).thenReturn(mockSelectItems);
        when(mockSelectItems.getSingleOrNull()).thenAnswer((_) async => tInventoryItem);

        final mockSelectLabels = MockSimpleSelectStatement<Label>();
        when(mockDatabase.select(mockDatabase.labels)).thenReturn(mockSelectLabels);
        when(mockSelectLabels.where(any)).thenReturn(mockSelectLabels);
        when(mockSelectLabels.get()).thenAnswer((_) async => [tLabel]);

        final result = await repository.getStats();

        expect(result, isA<Right<Failure, InventoryStats>>());
        expect(result.getRight().toNullable()?.totalItems, 5);
        expect(result.getRight().toNullable()?.totalLabels, 10);
        expect(result.getRight().toNullable()?.totalCategories, 1);
      });

      test('should return Failure on database error', () async {
        final mockSelectOnlyItems = MockSelectable<int>();
        when(mockDatabase.selectOnly(mockDatabase.inventoryItems)).thenReturn(mockSelectOnlyItems);
        when(mockSelectOnlyItems.addColumns(any)).thenReturn(mockSelectOnlyItems);
        when(mockSelectOnlyItems.map(any)).thenAnswer((_) => MockSelectable<int>());
        when(mockSelectOnlyItems.getSingle()).thenThrow(Exception('DB Error'));

        final result = await repository.getStats();

        expect(result, const Left(Failure.storage(message: 'Failed to get stats: Exception: DB Error')));
      });
    });
  });
}
