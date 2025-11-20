import 'package:flutter/material.dart';

class LabelEditor extends StatefulWidget {
  const LabelEditor({
    required this.initialLabels,
    required this.onLabelsChanged,
    super.key,
  });
  final List<String> initialLabels;
  final ValueChanged<List<String>> onLabelsChanged;

  @override
  State<LabelEditor> createState() => _LabelEditorState();
}

class _LabelEditorState extends State<LabelEditor> {
  late List<String> _labels;
  final _textController = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _labels = List.from(widget.initialLabels);
  }

  @override
  void dispose() {
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _addLabel(String label) {
    if (label.trim().isNotEmpty && !_labels.contains(label.trim())) {
      setState(() {
        _labels.add(label.trim());
        widget.onLabelsChanged(_labels);
      });
      _textController.clear();
    }
  }

  void _removeLabel(String label) {
    setState(() {
      _labels.remove(label);
      widget.onLabelsChanged(_labels);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Labels', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        // Display current labels as chips
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _labels
              .map(
                (label) => Chip(
                  label: Text(label),
                  deleteIcon: const Icon(Icons.close, size: 16),
                  onDeleted: () => _removeLabel(label),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 8),
        // Add new label input
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _textController,
                focusNode: _focusNode,
                decoration: InputDecoration(
                  hintText: 'Add a label...',
                  border: const OutlineInputBorder(),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.add),
                    onPressed: () {
                      _addLabel(_textController.text);
                      _focusNode.requestFocus();
                    },
                  ),
                ),
                onSubmitted: _addLabel,
              ),
            ),
          ],
        ),
      ],
    );
  }
}
