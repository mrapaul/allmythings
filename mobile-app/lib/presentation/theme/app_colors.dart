import 'package:flutter/material.dart';

/// Enchanted "Disney+" inspired palette: midnight ink, enchanted lavender,
/// pixie-dust gold, and a wash of rose / sky / lavender / mint glow.
/// Mirrors design/mobile-app/artifacts/home-inventory/constants/colors.ts.
@immutable
class AppPalette {
  const AppPalette({
    required this.text,
    required this.tint,
    required this.background,
    required this.foreground,
    required this.card,
    required this.cardForeground,
    required this.primary,
    required this.primaryForeground,
    required this.secondary,
    required this.secondaryForeground,
    required this.muted,
    required this.mutedForeground,
    required this.accent,
    required this.accentForeground,
    required this.destructive,
    required this.destructiveForeground,
    required this.success,
    required this.successForeground,
    required this.border,
    required this.input,
    required this.glowPrimary,
    required this.glowAccent,
    required this.glowMint,
    required this.glowSky,
    required this.glowButter,
  });

  final Color text;
  final Color tint;
  final Color background;
  final Color foreground;
  final Color card;
  final Color cardForeground;
  final Color primary;
  final Color primaryForeground;
  final Color secondary;
  final Color secondaryForeground;
  final Color muted;
  final Color mutedForeground;
  final Color accent;
  final Color accentForeground;
  final Color destructive;
  final Color destructiveForeground;
  final Color success;
  final Color successForeground;
  final Color border;
  final Color input;
  final Color glowPrimary;
  final Color glowAccent;
  final Color glowMint;
  final Color glowSky;
  final Color glowButter;

  static const AppPalette light = AppPalette(
    text: Color(0xFF1C1B3F),
    tint: Color(0xFF6E5BC9),
    background: Color(0xFFFBF7F1),
    foreground: Color(0xFF1C1B3F),
    card: Color(0xFFFFFFFF),
    cardForeground: Color(0xFF1C1B3F),
    primary: Color(0xFF6E5BC9),
    primaryForeground: Color(0xFFFFFFFF),
    secondary: Color(0xFFEEE9F7),
    secondaryForeground: Color(0xFF1C1B3F),
    muted: Color(0xFFF1ECF5),
    mutedForeground: Color(0xFF6F6C8A),
    accent: Color(0xFFE5B582),
    accentForeground: Color(0xFF1C1B3F),
    destructive: Color(0xFFD97A8C),
    destructiveForeground: Color(0xFFFFFFFF),
    success: Color(0xFF3FA372),
    successForeground: Color(0xFFFFFFFF),
    border: Color(0xFFE8E2F0),
    input: Color(0xFFF1ECF5),
    glowPrimary: Color(0xFFE4DAFF),
    glowAccent: Color(0xFFF5D9DC),
    glowMint: Color(0xFFD5EFE0),
    glowSky: Color(0xFFD5E4FF),
    glowButter: Color(0xFFFDEBBF),
  );

  static const AppPalette dark = AppPalette(
    text: Color(0xFFECE7FF),
    tint: Color(0xFFA999F0),
    background: Color(0xFF13122E),
    foreground: Color(0xFFECE7FF),
    card: Color(0xFF1D1B3D),
    cardForeground: Color(0xFFECE7FF),
    primary: Color(0xFFA999F0),
    primaryForeground: Color(0xFF13122E),
    secondary: Color(0xFF262549),
    secondaryForeground: Color(0xFFECE7FF),
    muted: Color(0xFF262549),
    mutedForeground: Color(0xFF9893B8),
    accent: Color(0xFFE5B582),
    accentForeground: Color(0xFF13122E),
    destructive: Color(0xFFE88AA0),
    destructiveForeground: Color(0xFF13122E),
    success: Color(0xFF74D4A3),
    successForeground: Color(0xFF13122E),
    border: Color(0xFF2E2C54),
    input: Color(0xFF262549),
    glowPrimary: Color(0xFF3D2F70),
    glowAccent: Color(0xFF5A3548),
    glowMint: Color(0xFF2E4A3D),
    glowSky: Color(0xFF2C3D6C),
    glowButter: Color(0xFF5A4A26),
  );
}

/// Theme extension to expose [AppPalette] via `Theme.of(context).extension`.
/// Use [AppPaletteX.palette] for ergonomic access from widgets.
@immutable
class AppPaletteTheme extends ThemeExtension<AppPaletteTheme> {
  const AppPaletteTheme(this.palette);
  final AppPalette palette;

  @override
  AppPaletteTheme copyWith({AppPalette? palette}) =>
      AppPaletteTheme(palette ?? this.palette);

  @override
  AppPaletteTheme lerp(ThemeExtension<AppPaletteTheme>? other, double t) {
    if (other is! AppPaletteTheme) return this;
    return t < 0.5 ? this : other;
  }
}

extension AppPaletteX on BuildContext {
  AppPalette get palette =>
      Theme.of(this).extension<AppPaletteTheme>()!.palette;
}
