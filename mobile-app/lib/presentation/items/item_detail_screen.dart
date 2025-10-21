import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io';
import 'dart:convert';
import '../../application/providers/inventory_providers.dart';
import '../../domain/models/detection.dart';
import '../common/loading_indicator.dart';
import 'edit_labels_screen.dart';

/// Instagram-style item detail screen
class ItemDetailScreen extends ConsumerWidget {
  final int itemId;

  const ItemDetailScreen({super.key, required this.itemId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemAsync = ref.watch(inventoryItemProvider(itemId));
    final labelsAsync = ref.watch(itemLabelsProvider(itemId));

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.more_horiz),
            onPressed: () {
              _showOptionsMenu(context, ref, itemId);
            },
          ),
        ],
      ),
      body: itemAsync.when(
        data: (item) {
          if (item == null) {
            return const Center(
              child: Text(
                'Item not found',
                style: TextStyle(color: Colors.white),
              ),
            );
          }

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Photo
                AspectRatio(
                  aspectRatio: 1,
                  child: item.photoPath.isNotEmpty
                      ? Image.file(
                          File(item.photoPath),
                          fit: BoxFit.contain,
                        )
                      : Container(
                          color: Colors.grey[900],
                          child: const Center(
                            child: Icon(
                              Icons.broken_image,
                              size: 64,
                              color: Colors.grey,
                            ),
                          ),
                        ),
                ),

                // Labels section
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Labels',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          TextButton.icon(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => EditLabelsScreen(itemId: itemId),
                                ),
                              );
                            },
                            icon: const Icon(Icons.edit, size: 18),
                            label: const Text('Edit'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      labelsAsync.when(
                        data: (labels) {
                          if (labels.isEmpty) {
                            return const Text(
                              'No labels yet. Tap Edit to add labels.',
                              style: TextStyle(color: Colors.grey),
                            );
                          }

                          return Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: labels.map((label) {
                              return Chip(
                                label: Text(
                                  label.key != null
                                      ? '${label.key}: ${label.value}'
                                      : label.value,
                                ),
                                backgroundColor: Colors.grey[100],
                              );
                            }).toList(),
                          );
                        },
                        loading: () =>
                            const CircularProgressIndicator.adaptive(),
                        error: (error, stack) => Text('Error loading labels'),
                      ),

                      const SizedBox(height: 24),

                      // Detection info
                      _buildDetectionInfo(item.detectionData),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const LoadingIndicator(),
        error: (error, stack) => Center(
          child: Text(
            'Error: $error',
            style: const TextStyle(color: Colors.white),
          ),
        ),
      ),
    );
  }

  Widget _buildDetectionInfo(String detectionDataJson) {
    try {
      final detectionData = jsonDecode(detectionDataJson);
      final detection = Detection.fromJson(detectionData);

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Detection Info',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          _buildInfoRow('Detected as', detection.label),
          _buildInfoRow(
            'Confidence',
            '${(detection.confidence * 100).toStringAsFixed(1)}%',
          ),
          _buildInfoRow(
            'Provider Agreement',
            '${detection.ensembleDetails.providerAgreement}/4',
          ),
          _buildInfoRow(
            'Consensus',
            detection.ensembleDetails.labelConsensus,
          ),
        ],
      );
    } catch (e) {
      return const SizedBox.shrink();
    }
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.grey),
          ),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  void _showOptionsMenu(BuildContext context, WidgetRef ref, int itemId) {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.delete, color: Colors.red),
              title: const Text(
                'Delete Item',
                style: TextStyle(color: Colors.red),
              ),
              onTap: () async {
                Navigator.pop(context);
                final shouldDelete = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Delete Item?'),
                    content:
                        const Text('This action cannot be undone.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.red,
                        ),
                        child: const Text('Delete'),
                      ),
                    ],
                  ),
                );

                if (shouldDelete == true) {
                  final repository = ref.read(inventoryRepositoryProvider);
                  await repository.deleteItem(itemId);
                  if (context.mounted) {
                    Navigator.pop(context);
                  }
                  ref.invalidate(inventoryItemsProvider);
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.cancel),
              title: const Text('Cancel'),
              onTap: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }
}
