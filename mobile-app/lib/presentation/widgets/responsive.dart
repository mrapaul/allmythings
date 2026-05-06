import 'package:flutter/widgets.dart';

enum AppBreakpoint { sm, md, lg, xl }

/// Computed responsive layout values, mirroring the design's
/// `hooks/useResponsive.ts`. Read via [ResponsiveX.responsive] on
/// any [BuildContext] — recomputes from MediaQuery on every call.
@immutable
class Responsive {
  const Responsive({
    required this.width,
    required this.height,
    required this.breakpoint,
    required this.columns,
    required this.contentMaxWidth,
    required this.gutter,
    required this.cardGap,
    required this.capsuleMaxWidth,
  });

  final double width;
  final double height;
  final AppBreakpoint breakpoint;

  /// Grid column count for the masonry feed.
  final int columns;

  /// Max content width clamp. On wide screens the feed reads like a tablet,
  /// not a stretched mobile.
  final double contentMaxWidth;

  /// Horizontal page gutter.
  final double gutter;

  /// Inter-card gap inside the masonry grid.
  final double cardGap;

  /// Max width of the floating action capsule on wide screens.
  final double capsuleMaxWidth;

  factory Responsive.of(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final w = size.width;
    final h = size.height;

    final breakpoint = w < 600
        ? AppBreakpoint.sm
        : w < 900
            ? AppBreakpoint.md
            : w < 1200
                ? AppBreakpoint.lg
                : AppBreakpoint.xl;

    final columns = w < 380
        ? 2
        : w < 640
            ? 2
            : w < 880
                ? 3
                : w < 1120
                    ? 4
                    : w < 1440
                        ? 5
                        : 6;

    final contentMaxWidth = breakpoint == AppBreakpoint.xl
        ? 1100.0
        : breakpoint == AppBreakpoint.lg
            ? 920.0
            : w;

    final gutter = breakpoint == AppBreakpoint.sm
        ? 16.0
        : breakpoint == AppBreakpoint.md
            ? 20.0
            : 28.0;

    final cardGap = breakpoint == AppBreakpoint.sm
        ? 12.0
        : breakpoint == AppBreakpoint.md
            ? 14.0
            : 18.0;

    final capsuleMaxWidth = breakpoint == AppBreakpoint.sm
        ? (w - 32).clamp(0.0, 380.0)
        : 420.0;

    return Responsive(
      width: w,
      height: h,
      breakpoint: breakpoint,
      columns: columns,
      contentMaxWidth: contentMaxWidth,
      gutter: gutter,
      cardGap: cardGap,
      capsuleMaxWidth: capsuleMaxWidth,
    );
  }

  bool get isCompact => breakpoint == AppBreakpoint.sm;

  bool get isWide =>
      breakpoint == AppBreakpoint.lg || breakpoint == AppBreakpoint.xl;
}

extension ResponsiveX on BuildContext {
  Responsive get responsive => Responsive.of(this);
}
