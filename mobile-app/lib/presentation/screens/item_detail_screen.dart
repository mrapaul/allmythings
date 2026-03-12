import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Detail screen for a single inventory item
class ItemDetailScreen extends ConsumerWidget {
  const ItemDetailScreen({required this.itemId, super.key});

  final int itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemAsync = ref.watch(inventoryItemProvider(itemId));
    final labelsAsync = ref.watch(itemLabelsProvider(itemId));

    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: () => _showDeleteDialog(context, ref),
          ),
        ],
      ),
      body: itemAsync.when(
        data: (item) {
          if (item == null) {
            return const Center(child: Text('Item not found'));
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Hero image
                Hero(
                  tag: 'item-$itemId',
                  child: InteractiveViewer(
                    child: Container(
                      width: double.infinity,
                      height: 400,
                      color: AppTheme.surfaceLight,
                      child: item.photoPath.isNotEmpty
                          ? Image.file(
                              File(item.photoPath),
                              fit: BoxFit.contain,
                            )
                          : const Center(
                              child: Icon(Icons.image_not_supported),
                            ),
                    ),
                  ),
                ),

                // Labels section
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Labels',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 12),
                      labelsAsync.when(
                        data: (labels) {
                          if (labels.isEmpty) {
                            return const Text('No labels');
                          }

                          // Group labels by key
                          final grouped = <String, List<String>>{};
                          for (final label in labels) {
                            grouped
                                .putIfAbsent(label.key, () => [])
                                .add(label.value);
                          }

                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: grouped.entries.map((entry) {
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      entry.key.toUpperCase(),
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.copyWith(
                                            color: Colors.grey,
                                            fontWeight: FontWeight.w600,
                                          ),
                                    ),
                                    const SizedBox(height: 4),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 4,
                                      children: entry.value.map((value) {
                                        return Chip(
                                          label: Text(value),
                                          backgroundColor:
                                              AppTheme.surfaceLight,
                                        );
                                      }).toList(),
                                    ),
                                  ],
                                ),
                              );
                            }).toList(),
                          );
                        },
                        loading: () =>
                            const CircularProgressIndicator(),
                        error: (e, _) =>
                            Text('Error loading labels: $e'),
                      ),

                      const SizedBox(height: 24),

                      // Metadata
                      Text(
                        'Created',
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _formatDate(item.createdAt),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
      ),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Item'),
        content: const Text('Are you sure you want to delete this item?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if ((confirmed ?? false) && context.mounted) {
      final repository =
          await ref.read(inventoryRepositoryProvider.future);
      await repository.deleteItem(itemId);
      ref.invalidate(inventoryItemsProvider);
      if (context.mounted) {
        context.pop();
      }
    }
  }

  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')} '
        '${date.hour.toString().padLeft(2, '0')}:'
        '${date.minute.toString().padLeft(2, '0')}';
  }
}
