import 'dart:convert';
import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Screen showing items in a specific room
class RoomDetailScreen extends ConsumerWidget {
  const RoomDetailScreen({
    required this.roomId,
    super.key,
  });

  final int roomId;

  IconData _getRoomIcon(String? iconName) {
    switch (iconName) {
      case 'kitchen':
        return Icons.kitchen;
      case 'weekend':
        return Icons.weekend;
      case 'bed':
        return Icons.bed;
      case 'bathroom':
        return Icons.bathroom;
      case 'desk':
        return Icons.desk;
      case 'garage':
        return Icons.garage;
      case 'yard':
        return Icons.yard;
      case 'storage':
        return Icons.storage;
      default:
        return Icons.room;
    }
  }

  Color _getRoomColor(String? colorHex) {
    if (colorHex == null || colorHex.isEmpty) {
      return Colors.grey.shade600;
    }
    try {
      return Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
    } catch (_) {
      return Colors.grey.shade600;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roomsAsync = ref.watch(allRoomsProvider);
    final itemsAsync = ref.watch(roomItemsProvider(roomId));

    return Scaffold(
      backgroundColor: Colors.white,
      body: roomsAsync.when(
        data: (rooms) {
          final room = rooms.where((r) => r.id == roomId).firstOrNull;
          if (room == null) {
            return const Center(child: Text('Room not found'));
          }

          return CustomScrollView(
            slivers: [
              // App bar with room info
              SliverAppBar(
                expandedHeight: 120,
                pinned: true,
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    room.name,
                    style: const TextStyle(
                      color: Colors.black,
                      fontWeight: FontWeight.w600,
                      fontSize: 18,
                    ),
                  ),
                  background: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          _getRoomColor(room.colorHex).withAlpha(30),
                          Colors.white,
                        ],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        _getRoomIcon(room.iconName),
                        size: 48,
                        color: _getRoomColor(room.colorHex).withAlpha(100),
                      ),
                    ),
                  ),
                ),
              ),

              // Items grid
              itemsAsync.when(
                data: (items) {
                  if (items.isEmpty) {
                    return SliverFillRemaining(
                      child: _buildEmptyState(room),
                    );
                  }

                  return SliverPadding(
                    padding: const EdgeInsets.all(1),
                    sliver: SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 4,
                        crossAxisSpacing: 1,
                        mainAxisSpacing: 1,
                        childAspectRatio: 1.0,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final item = items[index];
                          return _RoomItemTile(item: item);
                        },
                        childCount: items.length,
                      ),
                    ),
                  );
                },
                loading: () => const SliverFillRemaining(
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (error, _) => SliverFillRemaining(
                  child: Center(child: Text('Error: $error')),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Error: $error')),
      ),
    );
  }

  Widget _buildEmptyState(Category room) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _getRoomIcon(room.iconName),
            size: 64,
            color: _getRoomColor(room.colorHex).withAlpha(100),
          ),
          const SizedBox(height: 16),
          Text(
            'No items in ${room.name}',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Items you add to this room will appear here',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade500,
            ),
          ),
        ],
      ),
    );
  }
}

/// Grid item tile for room detail view
class _RoomItemTile extends StatelessWidget {
  const _RoomItemTile({required this.item});

  final InventoryItem item;

  String _getDisplayName() {
    try {
      final decoded = jsonDecode(item.detectionData);

      // Handle array format (current storage format)
      if (decoded is List && decoded.isNotEmpty) {
        final first = decoded.first as Map<String, dynamic>;
        if (first.containsKey('label')) {
          return _titleCase(first['label'] as String);
        }
      }

      // Handle object format (backwards compatibility)
      if (decoded is Map<String, dynamic>) {
        if (decoded.containsKey('label')) {
          return _titleCase(decoded['label'] as String);
        }
        if (decoded.containsKey('detections') && decoded['detections'] is List) {
          final detections = decoded['detections'] as List;
          if (detections.isNotEmpty) {
            final first = detections.first as Map<String, dynamic>;
            if (first.containsKey('label')) {
              return _titleCase(first['label'] as String);
            }
          }
        }
      }
    } catch (_) {}
    return 'Item';
  }

  String _titleCase(String text) {
    if (text.isEmpty) return text;
    return text.split(' ').map((word) {
      if (word.isEmpty) return word;
      return word[0].toUpperCase() + word.substring(1).toLowerCase();
    }).join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final displayName = _getDisplayName();

    return GestureDetector(
      onTap: () => context.push('/item/${item.id}'),
      child: Container(
        color: Colors.grey.shade100,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Thumbnail
            item.thumbnailPath.isNotEmpty
                ? Image.file(
                    File(item.thumbnailPath),
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: Colors.grey.shade200,
                        child: const Icon(Icons.broken_image, color: Colors.grey),
                      );
                    },
                  )
                : Container(
                    color: Colors.grey.shade200,
                    child: const Icon(Icons.image, color: Colors.grey),
                  ),

            // Name overlay
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withAlpha((255 * 0.85).round()),
                      Colors.black.withAlpha((255 * 0.4).round()),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.7, 1.0],
                  ),
                ),
                child: Text(
                  displayName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 8,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
