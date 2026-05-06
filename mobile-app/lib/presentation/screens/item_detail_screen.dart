import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/utils/inventory_summary.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:all_my_things/presentation/widgets/primary_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Item detail: hero photo + Fraunces-headline label (tap to edit) +
/// catalogue date + tag chips + notes card. Mirrors design's
/// app/item/[id].tsx layout, scoped to the data shape we actually have.
class ItemDetailScreen extends ConsumerStatefulWidget {
  const ItemDetailScreen({super.key, required this.itemId});

  final String itemId;

  @override
  ConsumerState<ItemDetailScreen> createState() => _ItemDetailScreenState();
}

class _ItemDetailScreenState extends ConsumerState<ItemDetailScreen> {
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final itemAsync = ref.watch(inventoryItemProvider(widget.itemId));
    final labelsAsync = ref.watch(itemLabelsProvider(widget.itemId));
    final mq = MediaQuery.of(context);

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            child: itemAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Text(
                  'Could not load item.\n$e',
                  textAlign: TextAlign.center,
                  style: AppTypography.inter(size: 14, color: p.mutedForeground),
                ),
              ),
              data: (item) {
                if (item == null) return const _NotFound();
                final summary = InventorySummary.fromItem(item);
                final labels = labelsAsync.value ?? const <Label>[];
                return _Body(
                  item: item,
                  summary: summary,
                  labels: labels,
                  bottomInset: mq.padding.bottom,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({
    required this.item,
    required this.summary,
    required this.labels,
    required this.bottomInset,
  });

  final InventoryItem item;
  final InventorySummary summary;
  final List<Label> labels;
  final double bottomInset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final width = MediaQuery.sizeOf(context).width;
    final gallerySize = (width - 64).clamp(220.0, 320.0);

    return Column(
      children: [
        _Header(
          category: summary.category,
          onBack: () => context.pop(),
          onDelete: () => _confirmDelete(context, ref),
        ),
        Expanded(
          child: ListView(
            padding: EdgeInsets.fromLTRB(0, 8, 0, bottomInset + 40),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: Hero(
                    tag: 'item-${item.id}',
                    child: Container(
                      width: gallerySize,
                      height: gallerySize,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: p.card,
                        border: Border.all(color: p.border),
                        borderRadius: BorderRadius.circular(28),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF2A1F2E).withValues(alpha: 0.10),
                            offset: const Offset(0, 8),
                            blurRadius: 18,
                          ),
                        ],
                      ),
                      child: item.photoPath.isNotEmpty &&
                              File(item.photoPath).existsSync()
                          ? Image.file(File(item.photoPath), fit: BoxFit.cover)
                          : ColoredBox(
                              color: p.muted,
                              child: Center(
                                child: Icon(Icons.image_not_supported_outlined,
                                    color: p.mutedForeground, size: 36),
                              ),
                            ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      summary.label.isEmpty ? 'Untitled' : summary.label,
                      style: AppTypography.fraunces(
                        size: 30,
                        weight: FontWeight.w700,
                        color: p.foreground,
                        letterSpacing: -0.6,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Catalogued ${_formatDate(item.createdAt)}',
                      style: AppTypography.inter(
                        size: 12,
                        color: p.mutedForeground,
                        letterSpacing: 0.2,
                      ),
                    ),
                    if (labels.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final l in labels.take(24))
                            _TagChip(value: l.value),
                        ],
                      ),
                    ],
                    const SizedBox(height: 24),
                    _NotesCard(
                      text: summary.label.isEmpty
                          ? 'No detection notes yet.'
                          : 'Detected as a ${summary.label.toLowerCase()}'
                              '${summary.category != 'Other' ? ' (${summary.category})' : ''}.',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete item?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              'Delete',
              style: TextStyle(color: ctx.palette.destructive),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      final repo = await ref.read(inventoryRepositoryProvider.future);
      await repo.deleteItem(item.id);
      ref.invalidate(inventoryItemsProvider);
      ref.invalidate(inventoryStatsProvider);
      if (context.mounted) context.pop();
    }
  }

  String _formatDate(DateTime d) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return '${months[d.month - 1]} ${d.day}, ${d.year}';
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.category,
    required this.onBack,
    required this.onDelete,
  });
  final String category;
  final VoidCallback onBack;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          _CircleBtn(
            icon: Icons.chevron_left,
            onTap: onBack,
            tooltip: 'Back',
          ),
          Expanded(
            child: Center(
              child: Text(
                category.toUpperCase(),
                style: AppTypography.inter(
                  size: 12,
                  weight: FontWeight.w500,
                  color: p.mutedForeground,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          ),
          _CircleBtn(
            icon: Icons.delete_outline,
            iconColor: p.destructive,
            onTap: onDelete,
            tooltip: 'Delete',
          ),
        ],
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({
    required this.icon,
    required this.onTap,
    required this.tooltip,
    this.iconColor,
  });
  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: p.card,
          shape: CircleBorder(side: BorderSide(color: p.border)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Center(
              child: Icon(icon, size: 18, color: iconColor ?? p.foreground),
            ),
          ),
        ),
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.value});
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 200),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: p.muted,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: p.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '#',
              style: AppTypography.inter(
                size: 12,
                weight: FontWeight.w600,
                color: p.primary,
              ),
            ),
            const SizedBox(width: 3),
            Flexible(
              child: Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.inter(
                  size: 13,
                  weight: FontWeight.w500,
                  color: p.foreground,
                  letterSpacing: 0.1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotesCard extends StatelessWidget {
  const _NotesCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: p.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'NOTES',
            style: AppTypography.inter(
              size: 11,
              weight: FontWeight.w600,
              color: p.mutedForeground,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            text,
            style: AppTypography.fraunces(
              size: 16,
              weight: FontWeight.w400,
              color: p.foreground,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _NotFound extends StatelessWidget {
  const _NotFound();

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Item not found',
              style: AppTypography.fraunces(
                size: 22,
                weight: FontWeight.w600,
                color: p.foreground,
              ),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Go back',
              expand: false,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ],
        ),
      ),
    );
  }
}
