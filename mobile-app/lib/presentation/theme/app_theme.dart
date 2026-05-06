import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Disney+ inspired theme: cream background, lavender primary, pixie-gold
/// accent, soft 22px corners, Fraunces serif headlines, Inter UI.
class AppTheme {
  AppTheme._();

  static const double radius = 22;
  static const double radiusSm = 14;

  static ThemeData light() => _build(AppPalette.light, Brightness.light);

  static ThemeData dark() => _build(AppPalette.dark, Brightness.dark);

  static ThemeData _build(AppPalette p, Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: p.primary,
      onPrimary: p.primaryForeground,
      secondary: p.accent,
      onSecondary: p.accentForeground,
      tertiary: p.success,
      onTertiary: p.successForeground,
      error: p.destructive,
      onError: p.destructiveForeground,
      surface: p.card,
      onSurface: p.foreground,
      surfaceContainerHighest: p.muted,
      outline: p.border,
      outlineVariant: p.border,
    );

    final textTheme = AppTypography.buildTextTheme(p.foreground, p.mutedForeground);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: p.background,
      canvasColor: p.background,
      textTheme: textTheme,
      iconTheme: IconThemeData(color: p.foreground, size: 22),
      extensions: [AppPaletteTheme(p)],

      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        foregroundColor: p.foreground,
        titleTextStyle: AppTypography.fraunces(
          size: 20,
          weight: FontWeight.w600,
          color: p.foreground,
          letterSpacing: -0.3,
        ),
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
      ),

      cardTheme: CardThemeData(
        color: p.card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: p.border),
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: p.primary,
          foregroundColor: p.primaryForeground,
          elevation: 0,
          minimumSize: const Size.fromHeight(48),
          textStyle: AppTypography.inter(size: 14, weight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSm),
          ),
        ),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.secondary,
          foregroundColor: p.secondaryForeground,
          elevation: 0,
          minimumSize: const Size.fromHeight(48),
          textStyle: AppTypography.inter(size: 14, weight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSm),
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.primary,
          textStyle: AppTypography.inter(size: 14, weight: FontWeight.w600),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.input,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: AppTypography.inter(size: 14, color: p.mutedForeground),
        labelStyle: AppTypography.inter(
          size: 12,
          weight: FontWeight.w500,
          color: p.mutedForeground,
          letterSpacing: 0.4,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: BorderSide(color: p.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: BorderSide(color: p.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusSm),
          borderSide: BorderSide(color: p.primary, width: 1.5),
        ),
      ),

      dividerTheme: DividerThemeData(color: p.border, thickness: 1, space: 1),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: p.card,
        modalBarrierColor: const Color(0xFF13122E).withValues(alpha: 0.45),
        elevation: 0,
        showDragHandle: true,
        dragHandleColor: p.border,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
        ),
        titleTextStyle: AppTypography.fraunces(
          size: 20,
          weight: FontWeight.w600,
          color: p.foreground,
          letterSpacing: -0.3,
        ),
        contentTextStyle: AppTypography.inter(
          size: 14,
          color: p.foreground,
          height: 1.5,
        ),
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDark ? p.muted : const Color(0xFF1C1B3F),
        contentTextStyle: AppTypography.inter(
          size: 13,
          weight: FontWeight.w500,
          color: const Color(0xFFFBF7F1),
        ),
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSm),
        ),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: p.muted,
        selectedColor: p.primary,
        labelStyle:
            AppTypography.inter(size: 12, weight: FontWeight.w500, color: p.foreground),
        secondaryLabelStyle: AppTypography.inter(
          size: 12,
          weight: FontWeight.w500,
          color: p.primaryForeground,
        ),
        side: BorderSide(color: p.border),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: p.primary,
        linearTrackColor: p.muted,
        circularTrackColor: p.muted,
      ),
    );
  }
}
