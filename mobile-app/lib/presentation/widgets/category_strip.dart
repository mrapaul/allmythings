import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Sort modes available on the home grid. Cycles via [cycleSort].
enum SortMode { newest, oldest, az }

SortMode cycleSort(SortMode current) {
  const order = SortMode.values;
  return order[(current.index + 1) % order.length];
}

extension SortModeX on SortMode {
  String get label => switch (this) {
        SortMode.newest => 'Newest',
        SortMode.oldest => 'Oldest',
        SortMode.az => 'A–Z',
      };

  IconData get icon => switch (this) {
        SortMode.newest => Icons.arrow_downward_rounded,
        SortMode.oldest => Icons.arrow_upward_rounded,
        SortMode.az => Icons.sort_by_alpha_rounded,
      };
}

@immutable
class CategoryItem {
  const CategoryItem({required this.key, required this.label, required this.count});
  final String key;
  final String label;
  final int count;
}

/// Horizontal category pills with live counts + a smart sort cycle button.
/// Active pill fills with the primary tone; sort button cycles
/// newest → oldest → az on tap.
class CategoryStrip extends StatelessWidget {
  const CategoryStrip({
    super.key,
    required this.categories,
    required this.activeKey,
    required this.onChange,
    required this.sort,
    required this.onCycleSort,
  });

  final List<CategoryItem> categories;
  final String activeKey;
  final ValueChanged<String> onChange;
  final SortMode sort;
  final VoidCallback onCycleSort;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(right: 8),
            child: Row(
              children: [
                for (final c in categories) ...[
                  _Pill(
                    item: c,
                    isActive: c.key == activeKey,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      onChange(c.key);
                    },
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(width: 2),
        Material(
          color: p.card,
          shape: StadiumBorder(side: BorderSide(color: p.border)),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: () {
              HapticFeedback.selectionClick();
              onCycleSort();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(sort.icon, size: 14, color: p.foreground),
                  const SizedBox(width: 6),
                  Text(
                    sort.label,
                    style: AppTypography.inter(
                      size: 12,
                      weight: FontWeight.w500,
                      color: p.foreground,
                      letterSpacing: 0.2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.item, required this.isActive, required this.onTap});
  final CategoryItem item;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final fg = isActive ? p.primaryForeground : p.foreground;
    return Material(
      color: isActive ? p.primary : p.card,
      shape: StadiumBorder(
        side: BorderSide(color: isActive ? p.primary : p.border),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 8, 0),
          child: SizedBox(
            height: 36,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  item.label,
                  style: AppTypography.inter(
                    size: 13,
                    weight: FontWeight.w500,
                    color: fg,
                    letterSpacing: 0.1,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  constraints: const BoxConstraints(minWidth: 22),
                  height: 20,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isActive
                        ? p.primaryForeground.withValues(alpha: 0.20)
                        : p.muted,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${item.count}',
                    style: AppTypography.inter(
                      size: 11,
                      weight: FontWeight.w600,
                      color: isActive ? p.primaryForeground : p.mutedForeground,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
