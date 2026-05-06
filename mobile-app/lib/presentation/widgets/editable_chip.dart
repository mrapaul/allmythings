import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';

/// Small editable tag chip — inline tap-to-edit, X to remove. Used in the
/// item detail screen for label/tag editing. Matches design's EditableChip.
class EditableChip extends StatefulWidget {
  const EditableChip({
    super.key,
    required this.value,
    required this.onChanged,
    this.onRemove,
    this.editable = true,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final VoidCallback? onRemove;
  final bool editable;

  @override
  State<EditableChip> createState() => _EditableChipState();
}

class _EditableChipState extends State<EditableChip> {
  late final TextEditingController _controller;
  final FocusNode _focusNode = FocusNode();
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
    _focusNode.addListener(() {
      if (!_focusNode.hasFocus && _editing) {
        _commit();
      }
    });
  }

  @override
  void didUpdateWidget(covariant EditableChip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value && !_editing) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _startEditing() {
    if (!widget.editable) return;
    setState(() => _editing = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
      _controller.selection =
          TextSelection(baseOffset: 0, extentOffset: _controller.text.length);
    });
  }

  void _commit() {
    final next = _controller.text.trim();
    setState(() => _editing = false);
    if (next.isEmpty) {
      widget.onRemove?.call();
      return;
    }
    if (next != widget.value) widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;

    return Container(
      constraints: const BoxConstraints(minHeight: 28),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: p.muted,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: p.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('#',
              style: AppTypography.inter(
                size: 12,
                weight: FontWeight.w600,
                color: p.mutedForeground,
              )),
          const SizedBox(width: 2),
          if (_editing)
            IntrinsicWidth(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                onSubmitted: (_) => _commit(),
                style: AppTypography.inter(
                  size: 12,
                  weight: FontWeight.w500,
                  color: p.foreground,
                ),
                cursorColor: p.primary,
                decoration: const InputDecoration(
                  isCollapsed: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: EdgeInsets.zero,
                  filled: false,
                ),
              ),
            )
          else
            GestureDetector(
              onTap: _startEditing,
              child: Text(
                widget.value,
                style: AppTypography.inter(
                  size: 12,
                  weight: FontWeight.w500,
                  color: p.foreground,
                ),
              ),
            ),
          if (widget.onRemove != null) ...[
            const SizedBox(width: 6),
            GestureDetector(
              onTap: widget.onRemove,
              child: Icon(Icons.close, size: 12, color: p.mutedForeground),
            ),
          ],
        ],
      ),
    );
  }
}
