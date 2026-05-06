import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';

/// Reusable pill-shaped primary action used inside sheets and the
/// profile/settings screens. Matches design's PrimaryButton.tsx.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.style = PrimaryButtonStyle.filled,
    this.expand = true,
    this.height = 46,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final PrimaryButtonStyle style;
  final bool expand;
  final double height;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final isDanger = style == PrimaryButtonStyle.danger;
    final isFilled = style == PrimaryButtonStyle.filled || isDanger;
    final bg = isDanger
        ? p.destructive
        : isFilled
            ? p.primary
            : Colors.transparent;
    final fg = isDanger
        ? p.destructiveForeground
        : isFilled
            ? p.primaryForeground
            : p.foreground;
    final border = isFilled ? bg : p.border;

    final button = Material(
      color: bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onPressed,
        child: SizedBox(
          height: height,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: fg),
                const SizedBox(width: 8),
              ],
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  label,
                  style: AppTypography.inter(
                    size: 14,
                    weight: FontWeight.w600,
                    color: fg,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

enum PrimaryButtonStyle { filled, secondary, danger }
