import 'dart:io';
// import '../../domain/models/detection_response.dart';
import '../../domain/models/detection.dart';
import 'package:all_my_things/application/providers/database_provider.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/remote/api_client.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod/src/providers/future_provider.dart';

// Export InventoryStats from repository
export '../../data/repositories/inventory_repository.dart' show InventoryStats;

/// Provider for detection repository (async for API client)
final detectionRepositoryProvider = FutureProvider<DetectionRepository>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

/// Provider for inventory repository (async because databaseProvider is async)
final inventoryRepositoryProvider = FutureProvider<InventoryRepository>((ref) async {
  final database = await ref.watch(databaseProvider.future);
  return InventoryRepository(database);
});

/// Notifier for managing the list of inventory items
class InventoryListNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    final repository = await ref.watch(inventoryRepositoryProvider.future);
    final result = await repository.getAllItems();

    return result.fold(
      (failure) {
        print('Inventory load error: $failure');
        return [];
      },
      (items) => items,
    );
  }

  /*
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
  */
}

/// Provider for all inventory items
final inventoryItemsProvider =
    AsyncNotifierProvider<InventoryListNotifier, List<InventoryItem>>(
      InventoryListNotifier.new,
    );

/// Provider for a single item by ID
final FutureProviderFamily<InventoryItem?, int> inventoryItemProvider =
    FutureProvider.family<InventoryItem?, int>((ref, itemId) async {
      final repository = await ref.watch(inventoryRepositoryProvider.future);
      final result = await repository.getItemById(itemId);

      return result.fold(
        (failure) => throw Exception(failure),
        (item) => item,
      );
    });

/// Provider for item labels
final FutureProviderFamily<List<Label>, int> itemLabelsProvider =
    FutureProvider.family<List<Label>, int>((ref, itemId) async {
      final repository = await ref.watch(inventoryRepositoryProvider.future);
      final result = await repository.getLabelsForItem(itemId);

      return result.fold(
        (failure) => throw Exception(failure),
        (labels) => labels,
      );
    });

/// Provider for search results (simple LIKE-based search)
final FutureProviderFamily<List<InventoryItem>, String> searchResultsProvider =
    FutureProvider.family<List<InventoryItem>, String>((ref, query) async {
      if (query.trim().isEmpty) return [];

      final repository = await ref.watch(inventoryRepositoryProvider.future);
      final result = await repository.searchItems(query);

      return result.fold(
        (failure) => throw Exception(failure),
        (items) => items,
      );
    });

/// Provider for inventory stats
final inventoryStatsProvider = FutureProvider<InventoryStats>((ref) async {
  try {
    final repository = await ref.watch(inventoryRepositoryProvider.future);
    final result = await repository.getStats();

    return result.fold(
      (failure) {
        // Return default stats on error
        print('Stats load error: $failure');
        return InventoryStats(
          totalItems: 0,
          totalLabels: 0,
          totalCategories: 0,
        );
      },
      (stats) => stats,
    );
  } catch (e) {
    // Return default stats on any error
    print('Stats provider error: $e');
    return InventoryStats(totalItems: 0, totalLabels: 0, totalCategories: 0);
  }
});

/// Provider for image detections
/// Calls the backend detection API with multipart image upload
final FutureProviderFamily<List<Detection>, File> imageDetectionsProvider =
    FutureProvider.family<List<Detection>, File>((ref, imageFile) async {
  try {
    final repository = await ref.watch(inventoryRepositoryProvider.future);
    // DetectionRepository is accessed through a separate provider
    // For now, we create it inline - can be refactored to a provider
    final detectionService = await ref.watch(detectionRepositoryProvider.future);
    final detections = await detectionService.detectObjects(imageFile);
    return detections;
  } catch (e) {
    print('Detection provider error: $e');
    return []; // Return empty list on error to avoid UI crashes
  }
});
