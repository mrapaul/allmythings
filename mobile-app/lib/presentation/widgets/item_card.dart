import 'dart:io';

import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

/// Status overlays surfaced on an inventory tile.
enum ItemCardStatus { pending, unconfirmed, completed, flagged, failed }

/// A single masonry tile: thumbnail + scrim + label/category caption,
/// with status overlays for pending / failed / unconfirmed states.
class ItemCard extends StatelessWidget {
  const ItemCard({
    super.key,
    required this.thumbnailPath,
    required this.heroTag,
    required this.label,
    required this.category,
    required this.status,
    required this.onTap,
    required this.onLongPress,
  });

  /// Local file path for the thumbnail. Empty path renders a placeholder.
  final String thumbnailPath;
  final Object heroTag;
  final String label;
  final String category;
  final ItemCardStatus status;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final isPending = status == ItemCardStatus.pending;

    return Hero(
      tag: heroTag,
      child: Material(
        color: p.card,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: p.border),
        ),
        elevation: 0,
        shadowColor: const Color(0xFF1C1B3F).withValues(alpha: 0.10),
        child: InkWell(
          onTap: isPending ? null : onTap,
          onLongPress: onLongPress,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (thumbnailPath.isNotEmpty &&
                  File(thumbnailPath).existsSync())
                Image.file(
                  File(thumbnailPath),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _Placeholder(palette: p),
                )
              else
                _Placeholder(palette: p),
              // Bottom scrim — design's `cardScrim` is the bottom 55%
              // of the tile filled with rgba(28,27,63,0.55). FractionallySizedBox
              // gives us that exact RN behavior.
              Align(
                alignment: Alignment.bottomCenter,
                child: FractionallySizedBox(
                  widthFactor: 1,
                  heightFactor: 0.55,
                  child: IgnorePointer(
                    child: ColoredBox(
                      color: Color(0x8C1C1B3F),
                    ),
                  ),
                ),
              ),
              if (label.isNotEmpty || category.isNotEmpty)
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (label.isNotEmpty)
                        Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.fraunces(
                            size: 15,
                            weight: FontWeight.w600,
                            color: Colors.white,
                            letterSpacing: -0.2,
                          ),
                        ),
                      if (category.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          category.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.inter(
                            size: 10,
                            weight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.85),
                            letterSpacing: 0.6,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              if (isPending)
                ColoredBox(
                  color: Colors.black.withValues(alpha: 0.30),
                  child: const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CupertinoActivityIndicator(color: Colors.white),
                        SizedBox(height: 8),
                        Text(
                          'IDENTIFYING',
                          key: Key('identifying-badge'),
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              if (status == ItemCardStatus.unconfirmed)
                Positioned(
                  top: 10,
                  right: 10,
                  child: _StatusBadge(
                    label: 'NEW',
                    background: p.success,
                    foreground: p.successForeground,
                  ),
                ),
              if (status == ItemCardStatus.flagged)
                Positioned(
                  top: 10,
                  right: 10,
                  child: _StatusBadge(
                    label: 'FLAGGED',
                    background: p.accent,
                    foreground: p.accentForeground,
                  ),
                ),
              if (status == ItemCardStatus.failed)
                ColoredBox(
                  color: Colors.black.withValues(alpha: 0.45),
                  child: Center(
                    child: Icon(
                      Icons.error_outline_rounded,
                      color: Colors.white.withValues(alpha: 0.9),
                      size: 30,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.palette});
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: palette.muted,
      child: Center(
        child: Icon(
          Icons.image_not_supported_outlined,
          color: palette.mutedForeground.withValues(alpha: 0.6),
          size: 28,
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.background,
    required this.foreground,
  });
  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: AppTypography.inter(
          size: 10,
          weight: FontWeight.w700,
          color: foreground,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}
