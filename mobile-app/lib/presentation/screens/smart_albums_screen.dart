import 'dart:convert';
import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Smart Albums that auto-group items by detected label type
class SmartAlbumsScreen extends ConsumerWidget {
  const SmartAlbumsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final smartAlbumsAsync = ref.watch(smartAlbumsProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Smart Albums',
          style: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w600,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () => context.pop(),
        ),
      ),
      body: smartAlbumsAsync.when(
        data: (albums) {
          if (albums.isEmpty) {
            return _buildEmptyState();
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: albums.length,
            itemBuilder: (context, index) {
              final album = albums[index];
              return _SmartAlbumTile(album: album);
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Error: $error')),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.auto_awesome,
            size: 64,
            color: Colors.purple.shade200,
          ),
          const SizedBox(height: 16),
          Text(
            'No Smart Albums Yet',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade700,
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 48),
            child: Text(
              'Smart albums automatically group items by their detected type. Add some items to see them organized!',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Data model for a smart album
class SmartAlbum {
  const SmartAlbum({
    required this.label,
    required this.items,
    this.icon,
    this.color,
  });

  final String label;
  final List<InventoryItem> items;
  final IconData? icon;
  final Color? color;

  int get itemCount => items.length;
}

/// Provider that groups items by their primary label
final smartAlbumsProvider = FutureProvider<List<SmartAlbum>>((ref) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  final itemsResult = await repository.getAllItems();

  return itemsResult.fold(
    (failure) => [],
    (items) {
      // Group items by their primary detected label
      final labelGroups = <String, List<InventoryItem>>{};

      for (final item in items) {
        final label = _extractPrimaryLabel(item.detectionData);
        if (label.isNotEmpty) {
          labelGroups.putIfAbsent(label, () => []).add(item);
        }
      }

      // Convert to SmartAlbum list, sorted by item count
      final albums = labelGroups.entries.map((entry) {
        return SmartAlbum(
          label: _titleCase(entry.key),
          items: entry.value,
          icon: _getLabelIcon(entry.key),
          color: _getLabelColor(entry.key),
        );
      }).toList();

      // Sort by item count descending
      albums.sort((a, b) => b.itemCount.compareTo(a.itemCount));

      return albums;
    },
  );
});

String _extractPrimaryLabel(String detectionData) {
  try {
    final decoded = jsonDecode(detectionData);

    // Handle array format (current storage format)
    if (decoded is List && decoded.isNotEmpty) {
      final first = decoded.first as Map<String, dynamic>;
      if (first.containsKey('label')) {
        return (first['label'] as String).toLowerCase();
      }
    }

    // Handle object format (backwards compatibility)
    if (decoded is Map<String, dynamic>) {
      if (decoded.containsKey('label')) {
        return (decoded['label'] as String).toLowerCase();
      }
      if (decoded.containsKey('detections') && decoded['detections'] is List) {
        final detections = decoded['detections'] as List;
        if (detections.isNotEmpty) {
          final first = detections.first as Map<String, dynamic>;
          if (first.containsKey('label')) {
            return (first['label'] as String).toLowerCase();
          }
        }
      }
    }
  } catch (_) {}
  return '';
}

String _titleCase(String text) {
  if (text.isEmpty) return text;
  return text.split(' ').map((word) {
    if (word.isEmpty) return word;
    return word[0].toUpperCase() + word.substring(1).toLowerCase();
  }).join(' ');
}

IconData _getLabelIcon(String label) {
  final normalizedLabel = label.toLowerCase();

  // Furniture
  if (normalizedLabel.contains('chair')) return Icons.chair;
  if (normalizedLabel.contains('sofa') || normalizedLabel.contains('couch')) {
    return Icons.weekend;
  }
  if (normalizedLabel.contains('table')) return Icons.table_restaurant;
  if (normalizedLabel.contains('bed')) return Icons.bed;
  if (normalizedLabel.contains('desk')) return Icons.desk;
  if (normalizedLabel.contains('shelf') || normalizedLabel.contains('bookcase')) {
    return Icons.shelves;
  }
  if (normalizedLabel.contains('cabinet') || normalizedLabel.contains('dresser')) {
    return Icons.kitchen;
  }

  // Electronics
  if (normalizedLabel.contains('tv') || normalizedLabel.contains('television')) {
    return Icons.tv;
  }
  if (normalizedLabel.contains('laptop') || normalizedLabel.contains('computer')) {
    return Icons.laptop;
  }
  if (normalizedLabel.contains('phone')) return Icons.phone_android;
  if (normalizedLabel.contains('speaker')) return Icons.speaker;
  if (normalizedLabel.contains('lamp') || normalizedLabel.contains('light')) {
    return Icons.lightbulb;
  }

  // Kitchen
  if (normalizedLabel.contains('refrigerator') || normalizedLabel.contains('fridge')) {
    return Icons.kitchen;
  }
  if (normalizedLabel.contains('oven') || normalizedLabel.contains('stove')) {
    return Icons.microwave;
  }
  if (normalizedLabel.contains('microwave')) return Icons.microwave;
  if (normalizedLabel.contains('sink')) return Icons.wash;
  if (normalizedLabel.contains('pot') || normalizedLabel.contains('pan')) {
    return Icons.soup_kitchen;
  }

  // Decor
  if (normalizedLabel.contains('plant') || normalizedLabel.contains('flower')) {
    return Icons.local_florist;
  }
  if (normalizedLabel.contains('vase')) return Icons.local_florist;
  if (normalizedLabel.contains('clock')) return Icons.access_time;
  if (normalizedLabel.contains('mirror')) return Icons.square;
  if (normalizedLabel.contains('rug') || normalizedLabel.contains('carpet')) {
    return Icons.rectangle;
  }
  if (normalizedLabel.contains('curtain') || normalizedLabel.contains('drape')) {
    return Icons.curtains;
  }
  if (normalizedLabel.contains('pillow') || normalizedLabel.contains('cushion')) {
    return Icons.airline_seat_flat;
  }
  if (normalizedLabel.contains('blanket') || normalizedLabel.contains('throw')) {
    return Icons.bed;
  }

  // Art
  if (normalizedLabel.contains('painting') || normalizedLabel.contains('art')) {
    return Icons.image;
  }
  if (normalizedLabel.contains('frame') || normalizedLabel.contains('picture')) {
    return Icons.image_outlined;
  }

  // Storage
  if (normalizedLabel.contains('box') || normalizedLabel.contains('container')) {
    return Icons.inventory_2;
  }
  if (normalizedLabel.contains('basket')) return Icons.shopping_basket;

  // Default
  return Icons.category;
}

Color _getLabelColor(String label) {
  final normalizedLabel = label.toLowerCase();

  // Furniture - warm browns
  if (normalizedLabel.contains('chair') ||
      normalizedLabel.contains('sofa') ||
      normalizedLabel.contains('couch') ||
      normalizedLabel.contains('table') ||
      normalizedLabel.contains('desk')) {
    return Colors.brown;
  }

  // Bedroom - soft purple
  if (normalizedLabel.contains('bed') ||
      normalizedLabel.contains('pillow') ||
      normalizedLabel.contains('blanket')) {
    return Colors.purple;
  }

  // Electronics - blue
  if (normalizedLabel.contains('tv') ||
      normalizedLabel.contains('laptop') ||
      normalizedLabel.contains('computer') ||
      normalizedLabel.contains('phone') ||
      normalizedLabel.contains('speaker')) {
    return Colors.blue;
  }

  // Lighting - amber
  if (normalizedLabel.contains('lamp') || normalizedLabel.contains('light')) {
    return Colors.amber;
  }

  // Kitchen - teal
  if (normalizedLabel.contains('refrigerator') ||
      normalizedLabel.contains('oven') ||
      normalizedLabel.contains('microwave') ||
      normalizedLabel.contains('sink')) {
    return Colors.teal;
  }

  // Plants - green
  if (normalizedLabel.contains('plant') || normalizedLabel.contains('flower')) {
    return Colors.green;
  }

  // Decor - pink
  if (normalizedLabel.contains('vase') ||
      normalizedLabel.contains('clock') ||
      normalizedLabel.contains('mirror')) {
    return Colors.pink;
  }

  // Art - deep purple
  if (normalizedLabel.contains('painting') ||
      normalizedLabel.contains('art') ||
      normalizedLabel.contains('frame')) {
    return Colors.deepPurple;
  }

  // Storage - grey
  if (normalizedLabel.contains('box') ||
      normalizedLabel.contains('basket') ||
      normalizedLabel.contains('container')) {
    return Colors.blueGrey;
  }

  // Default
  return Colors.grey;
}

/// Tile for displaying a smart album
class _SmartAlbumTile extends StatelessWidget {
  const _SmartAlbumTile({required this.album});

  final SmartAlbum album;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () => context.push('/smart-album/${album.label}'),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: (album.color ?? Colors.grey).withAlpha(25),
          borderRadius: BorderRadius.circular(12),
        ),
        child: album.items.isNotEmpty && album.items.first.thumbnailPath.isNotEmpty
            ? ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(
                  File(album.items.first.thumbnailPath),
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) {
                    return Icon(
                      album.icon ?? Icons.category,
                      color: album.color ?? Colors.grey,
                      size: 28,
                    );
                  },
                ),
              )
            : Icon(
                album.icon ?? Icons.category,
                color: album.color ?? Colors.grey,
                size: 28,
              ),
      ),
      title: Text(
        album.label,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),
      subtitle: Text(
        '${album.itemCount} ${album.itemCount == 1 ? 'item' : 'items'}',
        style: TextStyle(
          color: Colors.grey.shade600,
          fontSize: 13,
        ),
      ),
      trailing: Icon(
        Icons.chevron_right,
        color: Colors.grey.shade400,
      ),
    );
  }
}
