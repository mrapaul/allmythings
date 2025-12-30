import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bottom sheet for selecting a room to assign items to
class RoomSelectionSheet extends ConsumerStatefulWidget {
  const RoomSelectionSheet({
    required this.onRoomSelected,
    this.selectedRoomId,
    super.key,
  });

  final void Function(Category? room) onRoomSelected;
  final int? selectedRoomId;

  /// Show the room selection sheet
  static Future<Category?> show(BuildContext context, {int? selectedRoomId}) {
    return showModalBottomSheet<Category?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => RoomSelectionSheet(
        selectedRoomId: selectedRoomId,
        onRoomSelected: (room) => Navigator.pop(context, room),
      ),
    );
  }

  @override
  ConsumerState<RoomSelectionSheet> createState() => _RoomSelectionSheetState();
}

class _RoomSelectionSheetState extends ConsumerState<RoomSelectionSheet> {
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

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Title
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                const Icon(Icons.room_preferences, size: 24),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Select Room',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                // Skip button
                TextButton(
                  onPressed: () => widget.onRoomSelected(null),
                  child: const Text('Skip'),
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Room list
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.5,
            ),
            child: roomsAsync.when(
              data: (rooms) {
                if (rooms.isEmpty && !_showNewRoomInput) {
                  return _buildEmptyState();
                }

                return SingleChildScrollView(
                  child: Column(
                    children: [
                      // Existing rooms
                      ...rooms.map((room) => _buildRoomTile(room)),

                      // New room input
                      if (_showNewRoomInput)
                        _buildNewRoomInput()
                      else
                        _buildAddNewRoomButton(),

                      const SizedBox(height: 20),
                    ],
                  ),
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: CircularProgressIndicator(),
              ),
              error: (error, _) => Padding(
                padding: const EdgeInsets.all(20),
                child: Text('Error: $error'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.all(40),
      child: Column(
        children: [
          Icon(Icons.room_outlined, size: 48, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            'No rooms yet',
            style: TextStyle(
              fontSize: 16,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => setState(() => _showNewRoomInput = true),
            icon: const Icon(Icons.add),
            label: const Text('Create First Room'),
          ),
        ],
      ),
    );
  }

  Widget _buildRoomTile(Category room) {
    final isSelected = room.id == widget.selectedRoomId;

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: _getRoomColor(room.colorHex).withAlpha(30),
        child: Icon(
          _getRoomIcon(room.iconName),
          color: _getRoomColor(room.colorHex),
          size: 22,
        ),
      ),
      title: Text(
        room.name,
        style: TextStyle(
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
        ),
      ),
      trailing: isSelected
          ? const Icon(Icons.check_circle, color: Colors.green)
          : const Icon(Icons.chevron_right, color: Colors.grey),
      onTap: () => widget.onRoomSelected(room),
    );
  }

  Widget _buildAddNewRoomButton() {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: Colors.blue.shade50,
        child: Icon(Icons.add, color: Colors.blue.shade600),
      ),
      title: const Text(
        'Create New Room',
        style: TextStyle(
          color: Colors.blue,
          fontWeight: FontWeight.w500,
        ),
      ),
      onTap: () => setState(() => _showNewRoomInput = true),
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
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
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
      (roomId) async {
        // Refresh rooms list
        ref.invalidate(allRoomsProvider);

        // Get the newly created room
        final rooms = await repository.getAllRooms();
        final newRoom = rooms.where((r) => r.id == roomId).firstOrNull;

        if (mounted && newRoom != null) {
          widget.onRoomSelected(newRoom);
        }
      },
    );
  }
}
