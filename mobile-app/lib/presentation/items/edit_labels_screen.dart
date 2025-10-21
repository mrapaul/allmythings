import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../application/providers/inventory_providers.dart';
import '../common/loading_indicator.dart';

/// Edit labels for an item
class EditLabelsScreen extends ConsumerStatefulWidget {
  final int itemId;

  const EditLabelsScreen({super.key, required this.itemId});

  @override
  ConsumerState<EditLabelsScreen> createState() => _EditLabelsScreenState();
}

class _EditLabelsScreenState extends ConsumerState<EditLabelsScreen> {
  final TextEditingController _keyController = TextEditingController();
  final TextEditingController _valueController = TextEditingController();

  @override
  void dispose() {
    _keyController.dispose();
    _valueController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final labelsAsync = ref.watch(itemLabelsProvider(widget.itemId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit Labels'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddLabelDialog(context),
          ),
        ],
      ),
      body: labelsAsync.when(
        data: (labels) {
          if (labels.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.label_off_outlined,
                    size: 64,
                    color: Colors.grey,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No Labels',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Add labels like color, brand, room...',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: () => _showAddLabelDialog(context),
                    icon: const Icon(Icons.add),
                    label: const Text('Add First Label'),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            itemCount: labels.length,
            itemBuilder: (context, index) {
              final label = labels[index];
              return Dismissible(
                key: Key('label_${label.id}'),
                direction: DismissDirection.endToStart,
                background: Container(
                  color: Colors.red,
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  child: const Icon(
                    Icons.delete,
                    color: Colors.white,
                  ),
                ),
                confirmDismiss: (direction) async {
                  return await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Delete Label?'),
                      content: Text(
                        'Delete "${label.key != null ? '${label.key}: ${label.value}' : label.value}"?',
                      ),
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
                },
                onDismissed: (direction) async {
                  final repository = ref.read(inventoryRepositoryProvider);
                  await repository.deleteLabel(label.id);
                  ref.invalidate(itemLabelsProvider(widget.itemId));

                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Label deleted')),
                    );
                  }
                },
                child: ListTile(
                  leading: const Icon(Icons.label),
                  title: Text(
                    label.key != null
                        ? '${label.key}: ${label.value}'
                        : label.value,
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.edit),
                    onPressed: () => _showEditLabelDialog(context, label.id,
                        label.key, label.value),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const LoadingIndicator(),
        error: (error, stack) => Center(
          child: Text('Error: $error'),
        ),
      ),
    );
  }

  Future<void> _showAddLabelDialog(BuildContext context) async {
    _keyController.clear();
    _valueController.clear();

    return showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Label'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _keyController,
              decoration: const InputDecoration(
                labelText: 'Key (optional)',
                hintText: 'e.g., Color, Brand, Room',
              ),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _valueController,
              decoration: const InputDecoration(
                labelText: 'Value',
                hintText: 'e.g., Red, Nike, Kitchen',
              ),
              textCapitalization: TextCapitalization.words,
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              if (_valueController.text.trim().isEmpty) {
                return;
              }

              final repository = ref.read(inventoryRepositoryProvider);
              await repository.addLabel(
                itemId: widget.itemId,
                key: _keyController.text.trim().isEmpty
                    ? null
                    : _keyController.text.trim(),
                value: _valueController.text.trim(),
              );

              ref.invalidate(itemLabelsProvider(widget.itemId));

              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Label added')),
                );
              }
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  Future<void> _showEditLabelDialog(
    BuildContext context,
    int labelId,
    String? currentKey,
    String currentValue,
  ) async {
    _keyController.text = currentKey ?? '';
    _valueController.text = currentValue;

    return showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit Label'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _keyController,
              decoration: const InputDecoration(
                labelText: 'Key (optional)',
                hintText: 'e.g., Color, Brand, Room',
              ),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _valueController,
              decoration: const InputDecoration(
                labelText: 'Value',
                hintText: 'e.g., Red, Nike, Kitchen',
              ),
              textCapitalization: TextCapitalization.words,
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              if (_valueController.text.trim().isEmpty) {
                return;
              }

              final repository = ref.read(inventoryRepositoryProvider);
              await repository.updateLabel(
                labelId: labelId,
                key: _keyController.text.trim().isEmpty
                    ? null
                    : _keyController.text.trim(),
                value: _valueController.text.trim(),
              );

              ref.invalidate(itemLabelsProvider(widget.itemId));

              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Label updated')),
                );
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }
}
