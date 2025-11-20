import 'package:all_my_things/domain/models/inventory_item.dart';
import 'package:all_my_things/domain/models/inventory_stats.dart';
import 'package:all_my_things/domain/models/label.dart';
import 'package:fpdart/fpdart.dart';

abstract class InventoryRepository {
  Future<Either<Failure, int>> createItem({
    required String photoPath,
    required String thumbnailPath,
    required String detectionData,
  });

  Future<Either<Failure, List<InventoryItem>>> getAllItems();

  Future<Either<Failure, InventoryItem?>> getItemById(int id);

  Future<Either<Failure, void>> deleteItem(int id);

  Future<Either<Failure, List<Label>>> getLabelsForItem(int itemId);

  Future<Either<Failure, List<InventoryItem>>> searchItems(String query);

  Future<Either<Failure, int>> addLabel({
    required int itemId,
    required String value,
    String? key,
  });

  Future<Either<Failure, void>> updateLabel({
    required int labelId,
    required String? value,
    String? key,
  });

  Future<Either<Failure, void>> deleteLabel(int labelId);

  Future<Either<Failure, InventoryStats>> getStats();
}
