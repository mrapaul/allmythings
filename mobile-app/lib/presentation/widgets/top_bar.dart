import 'package:all_my_things/application/providers/homes_provider.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/application/providers/profile_provider.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/responsive.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Top bar = avatar (→ profile) | home pill with item count (tap → picker)
/// | settings cog. Mirrors design's TopBar.tsx, single source of chrome at
/// the top of the home screen.
class TopBar extends ConsumerWidget {
  const TopBar({super.key, required this.onPickHome});

  final VoidCallback onPickHome;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final r = context.responsive;
    final homes = ref.watch(homesProvider).value ?? HomesState.bootstrap;
    final profile = ref.watch(profileProvider).value;
    final itemsCount = ref.watch(inventoryItemsProvider).value?.length ?? 0;

    final initials = (profile?.initials ?? 'Y').toUpperCase();
    final activeHome = homes.activeHome;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        r.gutter,
        MediaQuery.paddingOf(context).top + 4,
        r.gutter,
        12,
      ),
      // Mirrors design's TopBar.tsx: justifyContent: 'space-between' on a
      // single Row — three elements pushed to start / center / end with
      // even gaps, NOT pinned to screen edges via Spacer.
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _IconShell(
            tooltip: 'Profile',
            onTap: () {
              HapticFeedback.selectionClick();
              context.push('/profile');
            },
            child: Text(
              initials.length > 2 ? initials.substring(0, 2) : initials,
              style: AppTypography.inter(
                size: 13,
                weight: FontWeight.w600,
                color: p.foreground,
                letterSpacing: 0.5,
              ),
            ),
          ),
          _HomePill(
            icon: activeHome.icon,
            count: itemsCount,
            isCompact: r.isCompact,
            onTap: () {
              HapticFeedback.selectionClick();
              onPickHome();
            },
          ),
          _IconShell(
            tooltip: 'Settings',
            onTap: () {
              HapticFeedback.selectionClick();
              context.push('/settings');
            },
            child: Icon(Icons.settings_outlined, size: 18, color: p.foreground),
          ),
        ],
      ),
    );
  }
}

class _IconShell extends StatelessWidget {
  const _IconShell({required this.child, required this.onTap, this.tooltip});
  final Widget child;
  final VoidCallback onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final btn = SizedBox(
      width: 46,
      height: 46,
      child: Material(
        color: p.card,
        shape: CircleBorder(side: BorderSide(color: p.border)),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Center(child: child),
        ),
      ),
    );
    return tooltip == null ? btn : Tooltip(message: tooltip!, child: btn);
  }
}

class _HomePill extends StatelessWidget {
  const _HomePill({
    required this.icon,
    required this.count,
    required this.isCompact,
    required this.onTap,
  });
  final String icon;
  final int count;
  final bool isCompact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    // Match design's TopBar.tsx homePill: height 46, paddingLeft 10,
    // paddingRight 14, gap 8 — same vertical metric as the 46-pt round
    // avatar/settings buttons so the three elements line up cleanly.
    return Material(
      color: p.card,
      shape: StadiumBorder(side: BorderSide(color: p.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: SizedBox(
          height: 46,
          child: Padding(
            padding: const EdgeInsets.only(left: 10, right: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  icon,
                  style: TextStyle(
                    fontSize: isCompact ? 22 : 24,
                    height: 1.0,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  constraints: const BoxConstraints(minWidth: 26),
                  height: 22,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: p.primary,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Text(
                    '$count',
                    style: AppTypography.inter(
                      size: 11,
                      weight: FontWeight.w600,
                      color: p.primaryForeground,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(Icons.keyboard_arrow_down_rounded,
                    size: 16, color: p.mutedForeground),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
