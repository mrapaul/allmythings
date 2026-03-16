import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart' as db;
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Notifier for search query state
class SearchQueryNotifier extends Notifier<String> {
  @override
  String build() => '';

  void update(String query) {
    state = query;
  }
}

/// Provider for the current search query
final searchQueryProvider = NotifierProvider<SearchQueryNotifier, String>(
  SearchQueryNotifier.new,
);

/// Modern, slick full-text search screen
class SearchScreen extends ConsumerWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(searchQueryProvider);
    final searchResultsAsync = ref.watch(searchResultsProvider(query));

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search your vault...',
            border: InputBorder.none,
            hintStyle: TextStyle(color: Colors.grey),
          ),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
          onChanged: (val) => ref.read(searchQueryProvider.notifier).update(val),
        ),
      ),
      body: query.isEmpty
          ? _buildEmptyState()
          : searchResultsAsync.when(
              data: _buildResultsList,
              loading: () => const Center(child: CircularProgressIndicator(color: Colors.black)),
              error: (error, _) => Center(child: Text('Error: $error')),
            ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.search_rounded, size: 80, color: Colors.grey.shade200),
          const SizedBox(height: 16),
          const Text(
            'Type to search labels, types, or categories',
            style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildResultsList(List<db.InventoryItem> items) {
    if (items.isEmpty) {
      return const Center(child: Text('No matching items found.'));
    }

    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, index) {
        return _SearchResultTile(item: items[index]);
      },
    );
  }
}

class _SearchResultTile extends ConsumerWidget {
  const _SearchResultTile({required this.item});

  final db.InventoryItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final labelsAsync = ref.watch(itemLabelsProvider(item.id));

    return ListTile(
      onTap: () => context.push('/item/${item.id}'),
      leading: Container(
        width: 50,
        height: 50,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          color: AppTheme.surfaceMedium,
        ),
        clipBehavior: Clip.antiAlias,
        child: item.thumbnailPath.isNotEmpty
            ? Image.file(File(item.thumbnailPath), fit: BoxFit.cover)
            : const Icon(Icons.image),
      ),
      title: labelsAsync.when(
        data: (labels) {
          final typeLabel = labels.where((l) => l.key == 'type').firstOrNull;
          return Text(
            typeLabel?.value ?? 'Unnamed Item',
            style: const TextStyle(fontWeight: FontWeight.bold),
          );
        },
        loading: () => const Text('Loading...'),
        error: (_, _) => const Text('Unnamed Item'),
      ),
      subtitle: labelsAsync.when(
        data: (labels) {
          final categoryLabel = labels.where((l) => l.key == 'category').firstOrNull;
          final brandLabel = labels.where((l) => l.key == 'brand').firstOrNull;
          
          final parts = [
            if (categoryLabel != null) categoryLabel.value,
            if (brandLabel != null) brandLabel.value,
          ];
          
          return Text(parts.join(' • '));
        },
        loading: () => const SizedBox.shrink(),
        error: (_, _) => const SizedBox.shrink(),
      ),
      trailing: const Icon(Icons.chevron_right_rounded, color: Colors.grey),
    );
  }
}
