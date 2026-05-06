import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum QuickAction { edit, move, delete }

/// Long-press contextual sheet: Rename / (Move) / Delete. Move is hidden
/// in single-home mode and surfaces automatically when more homes exist.
Future<QuickAction?> showQuickActionsSheet(
  BuildContext context, {
  required String? itemLabel,
  bool showMove = false,
}) {
  return showModalBottomSheet<QuickAction>(
    context: context,
    showDragHandle: false,
    builder: (_) => _QuickActionsSheet(itemLabel: itemLabel, showMove: showMove),
  );
}

class _QuickActionsSheet extends StatelessWidget {
  const _QuickActionsSheet({required this.itemLabel, required this.showMove});
  final String? itemLabel;
  final bool showMove;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final mqBottom = MediaQuery.viewPaddingOf(context).bottom;

    return Container(
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border(
          top: BorderSide(color: p.border),
          left: BorderSide(color: p.border),
          right: BorderSide(color: p.border),
        ),
      ),
      padding:
          EdgeInsets.fromLTRB(12, 10, 12, (mqBottom < 16 ? 16 : mqBottom) + 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: p.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          if (itemLabel != null && itemLabel!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '#${itemLabel!.toUpperCase()}',
                  style: AppTypography.inter(
                    size: 12,
                    weight: FontWeight.w500,
                    color: p.mutedForeground,
                    letterSpacing: 1,
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          _Row(
            icon: Icons.edit_outlined,
            label: 'Rename',
            onTap: () {
              HapticFeedback.selectionClick();
              Navigator.of(context).pop(QuickAction.edit);
            },
          ),
          if (showMove)
            _Row(
              icon: Icons.home_outlined,
              label: 'Move to another home',
              onTap: () {
                HapticFeedback.selectionClick();
                Navigator.of(context).pop(QuickAction.move);
              },
            ),
          _Row(
            icon: Icons.delete_outline,
            label: 'Delete item',
            tone: _RowTone.danger,
            onTap: () {
              HapticFeedback.heavyImpact();
              Navigator.of(context).pop(QuickAction.delete);
            },
          ),
        ],
      ),
    );
  }
}

enum _RowTone { normal, danger }

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.onTap,
    this.tone = _RowTone.normal,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final _RowTone tone;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final isDanger = tone == _RowTone.danger;
    final fg = isDanger ? p.destructive : p.foreground;
    final iconBg = isDanger
        ? p.destructive.withValues(alpha: 0.12)
        : p.secondary;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: iconBg,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 18, color: fg),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: AppTypography.inter(
                    size: 15,
                    weight: FontWeight.w500,
                    color: fg,
                    letterSpacing: -0.1,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, size: 16, color: p.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }
}
