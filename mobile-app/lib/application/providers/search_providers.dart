import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/domain/models/inventory_item.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod/riverpod.dart';

/// StateProvider for the search query
final searchQueryProvider = StateProvider<String>((ref) => '');

/// FutureProvider for search results
final searchResultsProvider = FutureProvider<List<InventoryItem>>((ref) async {
  final query = ref.watch(searchQueryProvider);
  final inventoryRepository = ref.watch(inventoryRepositoryProvider);

  final result = query.isEmpty
      ? await inventoryRepository.getAllItems()
      : await inventoryRepository.searchItems(query);

  return result.fold(
    (failure) => throw failure, // Propagate the error
    (items) => items,
  );
});
