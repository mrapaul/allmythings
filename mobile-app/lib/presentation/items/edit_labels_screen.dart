import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/common/custom_app_bar.dart'; // Added import
import 'package:all_my_things/presentation/common/loading_indicator.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Edit labels for an item
class EditLabelsScreen extends ConsumerStatefulWidget {
  const EditLabelsScreen({required this.itemId, super.key});
  final int itemId;

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
      appBar: CustomAppBar(
        title: 'Edit Labels',
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddLabelDialog(context),
          ),
        ],
      ), // Replaced AppBar
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
                  return showDialog<bool>(
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
                child: Card(
                  margin: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 4,
                  ),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: BorderSide(color: Colors.grey.shade200),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: 8,
                      horizontal: 16,
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.label_outline, color: Colors.grey.shade600),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            label.key != null
                                ? '${label.key}: ${label.value}'
                                : label.value,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.edit,
                            size: 20,
                            color: Colors.blueGrey,
                          ),
                          onPressed: () => _showEditLabelDialog(
                            context,
                            label.id,
                            label.key,
                            label.value,
                          ),
                        ),
                      ],
                    ),
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

    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: _buildLabelForm(
          context: context,
          title: 'Add Label',
          onSave: () async {
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
        ),
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

    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: _buildLabelForm(
          context: context,
          title: 'Edit Label',
          onSave: () async {
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
        ),
      ),
    );
  }

  Widget _buildLabelForm({
    required BuildContext context,
    required String title,
    required VoidCallback onSave,
  }) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _keyController,
            decoration: const InputDecoration(
              labelText: 'Key (optional)',
              hintText: 'e.g., Color, Brand, Room',
              border: OutlineInputBorder(),
            ),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _valueController,
            decoration: const InputDecoration(
              labelText: 'Value',
              hintText: 'e.g., Red, Nike, Kitchen',
              border: OutlineInputBorder(),
            ),
            textCapitalization: TextCapitalization.words,
            autofocus: true,
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: onSave,
                child: const Text('Save'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
