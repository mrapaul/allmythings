import 'dart:async';
import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart' as db;
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Highly refined Detail screen for a single inventory item
class ItemDetailScreen extends ConsumerWidget {
  const ItemDetailScreen({required this.itemId, super.key});

  final int itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemAsync = ref.watch(inventoryItemProvider(itemId));
    final labelsAsync = ref.watch(itemLabelsProvider(itemId));

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Item Details', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_horiz_rounded),
            onPressed: () => _showOptions(context, ref),
          ),
        ],
      ),
      body: itemAsync.when(
        data: (item) {
          if (item == null) return const Center(child: Text('Item not found'));

          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Hero Image
                Hero(
                  tag: 'item-$itemId',
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.file(
                          File(item.photoPath),
                          fit: BoxFit.cover,
                        ),
                        if (item.status == 'unconfirmed')
                          Positioned(
                            bottom: 20,
                            left: 20,
                            right: 20,
                            child: ElevatedButton.icon(
                              onPressed: () async {
                                await ref.read(inventoryItemsProvider.notifier).confirmItem(itemId);
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('Item confirmed and saved to vault')),
                                  );
                                }
                              },
                              icon: const Icon(Icons.check_circle_outline_rounded),
                              label: const Text('CONFIRM & SAVE TO VAULT', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentGreen,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: 8,
                                shadowColor: Colors.black45,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),

                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'CLASSIFIED LABELS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                          color: Colors.grey,
                        ),
                      ),
                      const SizedBox(height: 12),
                      labelsAsync.when(
                        data: (labels) => Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            ...labels.map((l) => _LabelChip(label: l)),
                            _EditButton(onTap: () {
                              unawaited(_showEditLabelsDialog(context, ref, labels));
                            }),
                          ],
                        ),
                        loading: () => const LinearProgressIndicator(),
                        error: (e, _) => Text('Error loading labels: $e'),
                      ),
                      const SizedBox(height: 32),
                      const Text(
                        'METADATA',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.2,
                          color: Colors.grey,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _MetadataRow(label: 'Captured', value: item.createdAt.toString()),
                      _MetadataRow(label: 'Status', value: item.status.toUpperCase()),
                    ],
                  ),
                ),
                const SizedBox(height: 40),
                Center(
                  child: TextButton.icon(
                    icon: const Icon(Icons.delete_outline_rounded, color: Colors.red),
                    label: const Text('Delete from Vault', style: TextStyle(color: Colors.red)),
                    onPressed: () {
                      unawaited(_showDeleteDialog(context, ref));
                    },
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  void _showOptions(BuildContext context, WidgetRef ref) {
    unawaited(showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit Labels'),
              onTap: () {
                Navigator.pop(context);
                final labels = ref.read(itemLabelsProvider(itemId)).value ?? [];
                unawaited(_showEditLabelsDialog(context, ref, labels));
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('Delete Item', style: TextStyle(color: Colors.red)),
              onTap: () {
                Navigator.pop(context);
                unawaited(_showDeleteDialog(context, ref));
              },
            ),
          ],
        ),
      ),
    ));
  }

  Future<void> _showEditLabelsDialog(BuildContext context, WidgetRef ref, List<db.Label> currentLabels) async {
    final labels = currentLabels.map((l) => LabelEntry(l.key, l.value)).toList();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _EditLabelsSheet(itemId: itemId, initialLabels: labels),
    );
  }

  Future<void> _showDeleteDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Item?'),
        content: const Text('This will permanently remove the item and its labels from your vault.'),
        actions: [
          TextButton(
            child: const Text('Cancel'),
            onPressed: () => Navigator.pop(context, false),
          ),
          TextButton(
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
            onPressed: () => Navigator.pop(context, true),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final repo = await ref.read(inventoryRepositoryProvider.future);
      await repo.deleteItem(itemId);
      ref.invalidate(inventoryItemsProvider);
      if (context.mounted) {
        context.pop();
      }
    }
  }
}

class _LabelChip extends StatelessWidget {
  const _LabelChip({required this.label});
  final db.Label label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.surfaceMedium,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '${label.key}: ',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey),
          ),
          Text(
            label.value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _EditButton extends StatelessWidget {
  const _EditButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.blueAccent),
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Text(
          'EDIT',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.blueAccent),
        ),
      ),
    );
  }
}

class _MetadataRow extends StatelessWidget {
  const _MetadataRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 80, child: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
        ],
      ),
    );
  }
}

class _EditLabelsSheet extends StatefulWidget {
  const _EditLabelsSheet({required this.itemId, required this.initialLabels});
  final int itemId;
  final List<LabelEntry> initialLabels;

  @override
  State<_EditLabelsSheet> createState() => _EditLabelsSheetState();
}

class _EditLabelsSheetState extends State<_EditLabelsSheet> {
  late List<LabelEntry> _labels;
  final _keyController = TextEditingController();
  final _valueController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _labels = List<LabelEntry>.from(widget.initialLabels);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer(builder: (context, ref, _) {
      return Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Edit Labels', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                IconButton(
                  icon: const Icon(Icons.check_circle_rounded, color: Colors.green, size: 32),
                  onPressed: () async {
                    await ref.read(inventoryItemsProvider.notifier).updateLabels(widget.itemId, _labels);
                    if (context.mounted) Navigator.pop(context);
                  },
                ),
              ],
            ),
            const SizedBox(height: 20),
            ..._labels.asMap().entries.map((entry) {
              final idx = entry.key;
              final label = entry.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(child: Text('${label.key}: ${label.value}', style: const TextStyle(fontWeight: FontWeight.w600))),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline, color: Colors.red),
                      onPressed: () => setState(() => _labels.removeAt(idx)),
                    ),
                  ],
                ),
              );
            }),
            const Divider(height: 32),
            const Text('ADD NEW LABEL', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.grey)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: TextField(controller: _keyController, decoration: const InputDecoration(hintText: 'Key (e.g. brand)', isDense: true))),
                const SizedBox(width: 12),
                Expanded(child: TextField(controller: _valueController, decoration: const InputDecoration(hintText: 'Value', isDense: true))),
                IconButton(
                  icon: const Icon(Icons.add_circle_outline, color: Colors.blueAccent),
                  onPressed: () {
                    if (_keyController.text.isNotEmpty && _valueController.text.isNotEmpty) {
                      setState(() => _labels.add(LabelEntry(_keyController.text, _valueController.text)));
                      _keyController.clear(); _valueController.clear();
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      );
    });
  }
}
