import 'package:mockito/mockito.dart';
import 'package:home_inventory/data/repositories/inventory_repository.dart';
import 'package:home_inventory/domain/models/detection.dart';
import 'package:home_inventory/data/database/app_database.dart';
import 'package:fpdart/fpdart.dart';
import 'package:home_inventory/core/errors/failures.dart';

class MockInventoryRepository extends Mock implements InventoryRepository {
  @override
  Future<Either<Failure, List<InventoryItem>>> getAllItems() =>
      super.noSuchMethod(
        Invocation.method(#getAllItems, []),
        returnValue: Future<Either<Failure, List<InventoryItem>>>.value(const Right<Failure, List<InventoryItem>>([])),
      );

  @override
  Future<Either<Failure, int>> createItem({
    required String photoPath,
    required String thumbnailPath,
    required Detection detection,
  }) =>
      super.noSuchMethod(
        Invocation.method(#createItem, [], {
          #photoPath: photoPath,
          #thumbnailPath: thumbnailPath,
          #detection: detection,
        }),
        returnValue: Future<Either<Failure, int>>.value(right<Failure, int>(1)),
      );

  @override
  Future<Either<Failure, InventoryItem?>> getItemById(int id) =>
      super.noSuchMethod(
        Invocation.method(#getItemById, [id]),
        returnValue: Future<Either<Failure, InventoryItem?>>.value(right<Failure, InventoryItem?>(InventoryItem(
          id: id,
          photoPath: 'mock_path',
          thumbnailPath: 'mock_thumb_path',
          detectionData: '{}',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ))),
      );

  @override
  Future<Either<Failure, List<Label>>> getLabelsForItem(int itemId) =>
      super.noSuchMethod(
        Invocation.method(#getLabelsForItem, [itemId]),
        returnValue: Future<Either<Failure, List<Label>>>.value(right<Failure, List<Label>>([])),
      );

  @override
  Future<Either<Failure, int>> addLabel({
    required int itemId,
    String? key,
    required String value,
  }) =>
      super.noSuchMethod(
        Invocation.method(#addLabel, [], {
          #itemId: itemId,
          #key: key,
          #value: value,
        }),
        returnValue: Future<Either<Failure, int>>.value(right<Failure, int>(1)),
      );

  @override
  Future<Either<Failure, void>> updateLabel({
    required int labelId,
    String? key,
    required String? value,
  }) =>
      super.noSuchMethod(
        Invocation.method(#updateLabel, [], {
          #labelId: labelId,
          #key: key,
          #value: value,
        }),
        returnValue: Future<Either<Failure, void>>.value(right<Failure, void>(null)),
      );

  @override
  Future<Either<Failure, void>> deleteLabel(int labelId) =>
      super.noSuchMethod(
        Invocation.method(#deleteLabel, [labelId]),
        returnValue: Future<Either<Failure, void>>.value(right<Failure, void>(null)),
      );

  @override
  Future<Either<Failure, List<InventoryItem>>> searchItems(String query) =>
      super.noSuchMethod(
        Invocation.method(#searchItems, [query]),
        returnValue: Future<Either<Failure, List<InventoryItem>>>.value(right<Failure, List<InventoryItem>>([])),
      );

  @override
  Future<Either<Failure, InventoryStats>> getStats() =>
      super.noSuchMethod(
        Invocation.method(#getStats, []),
        returnValue: Future<Either<Failure, InventoryStats>>.value(right<Failure, InventoryStats>(InventoryStats(
          totalItems: 0,
          totalLabels: 0,
          totalCategories: 0,
          lastCaptured: null,
        ))),
      );
}
