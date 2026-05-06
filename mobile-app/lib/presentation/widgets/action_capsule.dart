import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/widgets/responsive.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Floating bottom-of-screen action capsule:
///   📷 library  ┃  ✨ glowing camera (primary)  ┃  🔍 search-focus
///
/// The capsule is intentionally only as tall as itself — the parent
/// uses `Align(alignment: Alignment.bottomCenter, child: ActionCapsule)`
/// to pin it to the bottom. NEVER wrap this widget's content in `Center`
/// or `Expanded` — that would float the capsule to the screen's vertical
/// middle (a regression we shipped once already; don't re-introduce).
class ActionCapsule extends StatelessWidget {
  const ActionCapsule({
    super.key,
    required this.onLibrary,
    required this.onCamera,
    required this.onSearchToggle,
    this.searchActive = false,
  });

  final VoidCallback onLibrary;
  final VoidCallback onCamera;
  final VoidCallback onSearchToggle;
  final bool searchActive;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = context.responsive;
    final mq = MediaQuery.of(context);

    final bottom = mq.padding.bottom < 16 ? 16.0 : mq.padding.bottom;
    final capsuleHeight = r.isCompact ? 70.0 : 76.0;
    final capsuleRadius = r.isCompact ? 38.0 : 42.0;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
        width: r.capsuleMaxWidth,
        height: capsuleHeight,
        decoration: BoxDecoration(
          color: p.card,
          borderRadius: BorderRadius.circular(capsuleRadius),
          border: Border.all(color: p.border),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1C1B3F).withValues(alpha: 0.14),
              offset: const Offset(0, 16),
              blurRadius: 28,
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _SideBtn(
                tooltip: 'Pick from library',
                icon: Icons.image_outlined,
                onTap: () {
                  HapticFeedback.selectionClick();
                  onLibrary();
                },
              ),
              _CaptureBtn(
                onTap: () {
                  HapticFeedback.mediumImpact();
                  onCamera();
                },
              ),
              _SideBtn(
                tooltip: searchActive ? 'Close search' : 'Search',
                icon: searchActive ? Icons.close_rounded : Icons.search,
                onTap: () {
                  HapticFeedback.selectionClick();
                  onSearchToggle();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SideBtn extends StatelessWidget {
  const _SideBtn({
    required this.icon,
    required this.onTap,
    required this.tooltip,
  });
  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: 56,
        height: 56,
        child: Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Center(child: Icon(icon, size: 22, color: p.foreground)),
          ),
        ),
      ),
    );
  }
}

class _CaptureBtn extends StatelessWidget {
  const _CaptureBtn({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    // The capture button "lifts" out of the capsule — center button is
    // 72pt round, sitting on a 100pt halo, with the whole stack offset
    // upward so the bottom of the halo is roughly aligned with the
    // capsule centerline. Mirrors design's `captureWrap.marginTop: -22`.
    return SizedBox(
      width: 80,
      height: 80,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          // Halo glow
          Positioned(
            top: -10,
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: p.glowPrimary.withValues(alpha: 0.55),
              ),
            ),
          ),
          // Floating capture button
          Positioned(
            top: -22,
            child: Material(
              color: Colors.transparent,
              shape: const CircleBorder(),
              clipBehavior: Clip.antiAlias,
              child: Ink(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [p.primary, const Color(0xFF4A3A9C)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: p.primary.withValues(alpha: 0.5),
                      offset: const Offset(0, 10),
                      blurRadius: 18,
                    ),
                  ],
                ),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: onTap,
                  child: Center(
                    child: Icon(
                      Icons.camera_alt_rounded,
                      size: 26,
                      color: p.primaryForeground,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
