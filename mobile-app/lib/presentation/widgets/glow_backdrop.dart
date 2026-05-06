import 'dart:ui';

import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/widgets/responsive.dart';
import 'package:flutter/material.dart';

/// Pixie-dust backdrop. Soft multi-hue blobs (lavender / rose / sky / mint /
/// pixie-gold) diffused under a top-down gradient veil — gives every screen
/// the ambient enchanted feel without distracting from foreground content.
class GlowBackdrop extends StatelessWidget {
  const GlowBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = context.responsive;
    final scale = r.isWide ? 1.35 : 1.0;

    final blobs = <_BlobSpec>[
      _BlobSpec(color: p.glowPrimary, top: -120, right: -120, size: 460 * scale),
      _BlobSpec(color: p.glowSky, top: 200, left: -160, size: 360 * scale),
      _BlobSpec(color: p.glowAccent, bottom: -120, right: -80, size: 380 * scale),
      _BlobSpec(color: p.glowMint, bottom: 240, left: 60, size: 220 * scale),
      _BlobSpec(
        color: p.glowButter,
        top: r.height * 0.45,
        right: r.width * 0.35,
        size: 180 * scale,
      ),
    ];

    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(color: p.background),
          // Pastel blobs, blurred & half-opaque to read as pixie dust.
          ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
            child: Stack(
              children: [
                for (final b in blobs)
                  Positioned(
                    top: b.top,
                    bottom: b.bottom,
                    left: b.left,
                    right: b.right,
                    child: Container(
                      width: b.size,
                      height: b.size,
                      decoration: BoxDecoration(
                        color: b.color.withValues(alpha: 0.5),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // Top-down gradient veil dims the blobs at the bottom so foreground
          // content stays legible regardless of where blobs land.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  p.background.withValues(alpha: 0.07),
                  p.background.withValues(alpha: 0.6),
                  p.background,
                ],
                stops: const [0.0, 0.5, 1.0],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

@immutable
class _BlobSpec {
  const _BlobSpec({
    required this.color,
    required this.size,
    this.top,
    this.bottom,
    this.left,
    this.right,
  });
  final Color color;
  final double size;
  final double? top;
  final double? bottom;
  final double? left;
  final double? right;
}
