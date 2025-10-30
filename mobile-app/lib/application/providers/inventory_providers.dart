import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/database/app_database.dart';
import '../../data/repositories/inventory_repository.dart';
import '../../domain/models/detection_response.dart';
import '../../domain/models/detection.dart';
import 'database_provider.dart';

// Export InventoryStats from repository
export '../../data/repositories/inventory_repository.dart' show InventoryStats;

/// Provider for inventory repository
final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  final database = ref.watch(databaseProvider);
  return InventoryRepository(database);
});

/// Notifier for managing the list of inventory items
class InventoryListNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    final repository = ref.watch(inventoryRepositoryProvider);
    final result = await repository.getAllItems();

    return result.fold(
      (failure) {
        print('Inventory load error: ${failure.message}');
        return [];
      },
      (items) => items,
    );
  }

  Future<void> addItemFromDetection({
    required String photoPath,
    required String thumbnailPath,
    required Detection detection,
  }) async {
    state = const AsyncValue.loading();
    final repository = ref.read(inventoryRepositoryProvider);

    final result = await repository.createItem(
      photoPath: photoPath,
      thumbnailPath: thumbnailPath,
      detection: detection,
    );

    state = await AsyncValue.guard(() async {
      return result.fold(
        (failure) => throw Exception(failure.message),
        (itemId) async {
          // After adding, refresh the list from the database
          return await build();
        },
      );
    });
  }
}

/// Provider for all inventory items
final inventoryItemsProvider = AsyncNotifierProvider<InventoryListNotifier, List<InventoryItem>>(
  InventoryListNotifier.new,
);

/// Provider for a single item by ID
final inventoryItemProvider = FutureProvider.family<InventoryItem?, int>((ref, itemId) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  final result = await repository.getItemById(itemId);

  return result.fold(
    (failure) => throw Exception(failure.message),
    (item) => item,
  );
});

/// Provider for item labels
final itemLabelsProvider = FutureProvider.family<List<Label>, int>((ref, itemId) async {
  final repository = ref.watch(inventoryRepositoryProvider);
  final result = await repository.getLabelsForItem(itemId);

  return result.fold(
    (failure) => throw Exception(failure.message),
    (labels) => labels,
  );
});

/// Provider for search results
final searchResultsProvider = FutureProvider.family<List<InventoryItem>, String>((ref, query) async {
  if (query.isEmpty) {
    return [];
  }

  final repository = ref.watch(inventoryRepositoryProvider);
  final result = await repository.searchItems(query);

  return result.fold(
    (failure) => throw Exception(failure.message),
    (items) => items,
  );
});

/// Provider for inventory stats
final inventoryStatsProvider = FutureProvider<InventoryStats>((ref) async {
  try {
    final repository = ref.watch(inventoryRepositoryProvider);
    final result = await repository.getStats();

    return result.fold(
      (failure) {
        // Return default stats on error
        print('Stats load error: ${failure.message}');
        return InventoryStats(totalItems: 0, totalLabels: 0, totalCategories: 0, lastCaptured: null);
      },
      (stats) => stats,
    );
  } catch (e) {
    // Return default stats on any error
    print('Stats provider error: $e');
    return InventoryStats(totalItems: 0, totalLabels: 0, totalCategories: 0, lastCaptured: null);
  }
});
