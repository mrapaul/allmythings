import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';

/// Centered empty-state with halo + emoji badge + reset action. Used on
/// the home grid when there are no items or a filter returned nothing.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.emoji,
    required this.title,
    required this.body,
    this.actionLabel,
    this.onAction,
  });

  final String emoji;
  final String title;
  final String body;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: p.glowPrimary.withValues(alpha: 0.55),
                ),
              ),
              Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: p.card,
                  shape: BoxShape.circle,
                  border: Border.all(color: p.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      offset: const Offset(0, 6),
                      blurRadius: 14,
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Text(emoji, style: const TextStyle(fontSize: 30)),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.fraunces(
              size: 26,
              weight: FontWeight.w600,
              color: p.foreground,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 320),
            child: Text(
              body,
              textAlign: TextAlign.center,
              style: AppTypography.inter(
                size: 14,
                color: p.mutedForeground,
                height: 1.4,
              ),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 22),
            Material(
              color: p.primary,
              shape: const StadiumBorder(),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: onAction,
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
                  child: Text(
                    actionLabel!,
                    style: AppTypography.inter(
                      size: 13,
                      weight: FontWeight.w600,
                      color: p.primaryForeground,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
