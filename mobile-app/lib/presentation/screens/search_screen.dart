import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search...',
            border: InputBorder.none,
          ),
          onChanged: (value) {
            ref.read(searchQueryProvider.notifier).state = value;
          },
        ),
      ),
      body: Consumer(
        builder: (context, ref, child) {
          final searchQuery = ref.watch(searchQueryProvider);
          if (searchQuery.isEmpty) {
            return const Center(child: Text('Start typing to search.'));
          }

          final searchResults = ref.watch(searchResultsProvider(searchQuery));
          return searchResults.when(
            data: (items) {
              if (items.isEmpty) {
                return const Center(child: Text('No items found.'));
              }
              return ListView.builder(
                itemCount: items.length,
                itemBuilder: (context, index) {
                  final item = items[index];
                  return ListTile(
                    title: Text(item.photoPath),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stack) => Center(child: Text('Error: $error')),
          );
        },
      ),
    );
  }
}

final searchQueryProvider = StateProvider<String>((ref) => '');
