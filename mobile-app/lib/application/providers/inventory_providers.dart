import 'package:all_my_things/application/providers/database_provider.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Export InventoryStats from repository
export '../../data/repositories/inventory_repository.dart' show InventoryStats;

/// Provider for inventory repository (async because databaseProvider is async)
final inventoryRepositoryProvider =
    FutureProvider<InventoryRepository>((ref) async {
  final database = await ref.watch(databaseProvider.future);
  return InventoryRepository(database);
});

/// Notifier for managing the list of inventory items
class InventoryListNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    final repository = await ref.watch(inventoryRepositoryProvider.future);
    return repository.getAllItems();
  }

  /// Save a detected object as an inventory item
  Future<int> saveDetection({
    required String photoPath,
    required String thumbnailPath,
    required DetectedObject detection,
  }) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final itemId = await repository.saveDetection(
      photoPath: photoPath,
      thumbnailPath: thumbnailPath,
      detection: detection,
    );

    // Refresh the list
    ref.invalidateSelf();
    return itemId;
  }
}

/// Provider for all inventory items
final inventoryItemsProvider =
    AsyncNotifierProvider<InventoryListNotifier, List<InventoryItem>>(
  InventoryListNotifier.new,
);

/// Provider for a single item by ID
final inventoryItemProvider =
    FutureProvider.family<InventoryItem?, int>((ref, itemId) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getItemById(itemId);
});

/// Provider for item labels
final itemLabelsProvider =
    FutureProvider.family<List<Label>, int>((ref, itemId) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getLabelsForItem(itemId);
});

/// Provider for search results
final searchResultsProvider =
    FutureProvider.family<List<InventoryItem>, String>((ref, query) async {
  if (query.trim().isEmpty) return [];

  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.searchItems(query);
});

/// Provider for inventory stats
final inventoryStatsProvider = FutureProvider<InventoryStats>((ref) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getStats();
});
