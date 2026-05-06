import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Typography pairing matches the design: Fraunces serif for headlines,
/// Inter sans for UI/body text. Falls back to system fonts if Google Fonts
/// fetching fails (offline boot).
class AppTypography {
  AppTypography._();

  static const _displayLetterSpacing = -0.4;
  static const _titleLetterSpacing = -0.3;

  /// Fraunces serif headline at the requested size/weight.
  static TextStyle fraunces({
    required double size,
    FontWeight weight = FontWeight.w500,
    Color? color,
    double? letterSpacing,
    double? height,
  }) {
    return GoogleFonts.fraunces(
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  /// Inter sans UI text at the requested size/weight.
  static TextStyle inter({
    required double size,
    FontWeight weight = FontWeight.w400,
    Color? color,
    double? letterSpacing,
    double? height,
  }) {
    return GoogleFonts.inter(
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
    );
  }

  /// Build the [TextTheme] applied to ThemeData. Headlines use Fraunces,
  /// body/labels use Inter.
  static TextTheme buildTextTheme(Color foreground, Color muted) {
    final fraunces = GoogleFonts.frauncesTextTheme();
    final inter = GoogleFonts.interTextTheme();

    return TextTheme(
      displayLarge: fraunces.displayLarge?.copyWith(
        fontSize: 36,
        fontWeight: FontWeight.w600,
        letterSpacing: _displayLetterSpacing,
        height: 1.1,
        color: foreground,
      ),
      displayMedium: fraunces.displayMedium?.copyWith(
        fontSize: 30,
        fontWeight: FontWeight.w600,
        letterSpacing: _displayLetterSpacing,
        height: 1.15,
        color: foreground,
      ),
      displaySmall: fraunces.displaySmall?.copyWith(
        fontSize: 26,
        fontWeight: FontWeight.w600,
        letterSpacing: _displayLetterSpacing,
        height: 1.2,
        color: foreground,
      ),
      headlineLarge: fraunces.headlineLarge?.copyWith(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        letterSpacing: _titleLetterSpacing,
        height: 1.25,
        color: foreground,
      ),
      headlineMedium: fraunces.headlineMedium?.copyWith(
        fontSize: 22,
        fontWeight: FontWeight.w500,
        letterSpacing: _titleLetterSpacing,
        height: 1.3,
        color: foreground,
      ),
      headlineSmall: fraunces.headlineSmall?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.2,
        height: 1.3,
        color: foreground,
      ),
      titleLarge: inter.titleLarge?.copyWith(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
        color: foreground,
      ),
      titleMedium: inter.titleMedium?.copyWith(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
        color: foreground,
      ),
      titleSmall: inter.titleSmall?.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
        color: foreground,
      ),
      bodyLarge: inter.bodyLarge?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.45,
        color: foreground,
      ),
      bodyMedium: inter.bodyMedium?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 1.5,
        color: foreground,
      ),
      bodySmall: inter.bodySmall?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        height: 1.5,
        color: muted,
      ),
      labelLarge: inter.labelLarge?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
        color: foreground,
      ),
      labelMedium: inter.labelMedium?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.4,
        color: muted,
      ),
      labelSmall: inter.labelSmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.6,
        color: muted,
      ),
    );
  }
}
