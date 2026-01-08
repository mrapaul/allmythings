import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Rooms/Albums screen - Apple Photos-style organization
class RoomsScreen extends ConsumerStatefulWidget {
  const RoomsScreen({super.key});

  @override
  ConsumerState<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends ConsumerState<RoomsScreen> {
  final _newRoomController = TextEditingController();
  bool _showNewRoomInput = false;

  @override
  void dispose() {
    _newRoomController.dispose();
    super.dispose();
  }

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
  Widget build(BuildContext context) {
    final roomsAsync = ref.watch(allRoomsProvider);
    final itemCountsAsync = ref.watch(roomItemCountsProvider);
    final statsAsync = ref.watch(inventoryStatsProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Rooms',
          style: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.black),
            onPressed: () => setState(() => _showNewRoomInput = true),
          ),
        ],
      ),
      body: Column(
        children: [
          // Stats header
          statsAsync.when(
            data: _buildStatsHeader,
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // All Items section
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: _buildAllItemsTile(ref),
          ),

          // Smart Albums tile
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: _buildSmartAlbumsTile(ref),
          ),

          // Rooms section header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Row(
              children: [
                Text(
                  'MY ROOMS',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey.shade500,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),

          // New room input
          if (_showNewRoomInput) _buildNewRoomInput(),

          // Rooms list
          Expanded(
            child: roomsAsync.when(
              data: (rooms) {
                if (rooms.isEmpty && !_showNewRoomInput) {
                  return _buildEmptyState();
                }

                return itemCountsAsync.when(
                  data: (counts) => _buildRoomsList(rooms, counts),
                  loading: () => _buildRoomsList(rooms, {}),
                  error: (_, __) => _buildRoomsList(rooms, {}),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('Error: $error')),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsHeader(InventoryStats stats) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.blue.shade50, Colors.purple.shade50],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatItem(
            icon: Icons.inventory_2_outlined,
            value: stats.totalItems.toString(),
            label: 'Items',
          ),
          _buildStatItem(
            icon: Icons.label_outline,
            value: stats.totalLabels.toString(),
            label: 'Labels',
          ),
          _buildStatItem(
            icon: Icons.room_outlined,
            value: stats.totalCategories.toString(),
            label: 'Rooms',
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem({
    required IconData icon,
    required String value,
    required String label,
  }) {
    return Column(
      children: [
        Icon(icon, color: Colors.grey.shade700, size: 24),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade600,
          ),
        ),
      ],
    );
  }

  Widget _buildAllItemsTile(WidgetRef ref) {
    final itemsAsync = ref.watch(inventoryItemsProvider);

    return GestureDetector(
      onTap: () => context.go('/'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF405DE6), Color(0xFFC13584)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.grid_view, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'All Items',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  itemsAsync.when(
                    data: (items) => Text(
                      '${items.length} items',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                      ),
                    ),
                    loading: () => const SizedBox.shrink(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }

  Widget _buildSmartAlbumsTile(WidgetRef ref) {
    return GestureDetector(
      onTap: () => context.push('/smart-albums'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.purple.shade50,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.purple.shade400, Colors.deepPurple.shade600],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.auto_awesome, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Smart Albums',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    'Auto-grouped by type',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.room_outlined, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            'No rooms yet',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Create rooms to organize your items',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade500,
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => setState(() => _showNewRoomInput = true),
            icon: const Icon(Icons.add),
            label: const Text('Create Room'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNewRoomInput() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _newRoomController,
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'Room name (e.g., Attic, Garage)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              textCapitalization: TextCapitalization.words,
              onSubmitted: (_) => _createRoom(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            onPressed: () => setState(() {
              _showNewRoomInput = false;
              _newRoomController.clear();
            }),
            icon: const Icon(Icons.close),
          ),
          IconButton(
            onPressed: _createRoom,
            icon: const Icon(Icons.check, color: Colors.green),
          ),
        ],
      ),
    );
  }

  Widget _buildRoomsList(List<Category> rooms, Map<int, int> counts) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: rooms.length,
      itemBuilder: (context, index) {
        final room = rooms[index];
        final count = counts[room.id] ?? 0;
        return _buildRoomTile(room, count);
      },
    );
  }

  Widget _buildRoomTile(Category room, int itemCount) {
    return GestureDetector(
      onTap: () => context.push('/room/${room.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            // Room icon
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: _getRoomColor(room.colorHex).withAlpha(25),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _getRoomIcon(room.iconName),
                color: _getRoomColor(room.colorHex),
                size: 28,
              ),
            ),
            const SizedBox(width: 12),
            // Room name and count
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    room.name,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '$itemCount items',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            // System badge
            if (room.isSystem)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Default',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.blue.shade700,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }

  Future<void> _createRoom() async {
    final name = _newRoomController.text.trim();
    if (name.isEmpty) return;

    final repository = await ref.read(inventoryRepositoryProvider.future);
    final result = await repository.createRoom(name: name);

    result.fold(
      (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $error')),
          );
        }
      },
      (_) {
        // Refresh rooms list
        ref.invalidate(allRoomsProvider);
        ref.invalidate(roomItemCountsProvider);
        ref.invalidate(inventoryStatsProvider);

        setState(() {
          _showNewRoomInput = false;
          _newRoomController.clear();
        });
      },
    );
  }
}
