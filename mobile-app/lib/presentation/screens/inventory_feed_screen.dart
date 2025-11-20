import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Instagram-style grid feed of inventory items
class InventoryFeedScreen extends ConsumerWidget {
  const InventoryFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(inventoryItemsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Inventory'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => context.push('/search'),
          ),
        ],
      ),
      body: itemsAsync.when(
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.inventory_2_outlined,
                    size: 80,
                    color: AppTheme.textTertiary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No items yet',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tap the camera button to add items',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(inventoryItemsProvider);
            },
            child: GridView.builder(
              padding: const EdgeInsets.all(4),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 4,
                mainAxisSpacing: 4,
              ),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final item = items[index];
                return Hero(
                  tag: 'item-${item.id}',
                  child: GestureDetector(
                    onTap: () => context.push('/item/${item.id}'),
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppTheme.surfaceLight,
                        border: Border.all(color: AppTheme.borderLight),
                      ),
                      child: item.thumbnailPath.isNotEmpty
                          ? Image.file(
                              File(item.thumbnailPath),
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) {
                                return const Center(
                                  child: Icon(Icons.broken_image),
                                );
                              },
                            )
                          : const Center(child: Icon(Icons.image_not_supported)),
                    ),
                  ),
                );
              },
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Text('Error: $error'),
        ),
      ),
    );
  }
}
