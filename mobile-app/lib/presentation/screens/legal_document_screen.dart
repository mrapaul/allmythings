import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

/// Privacy / Terms / etc — renders the legal Markdown asset inside the
/// new ambient theme. Same content as the legacy version, restyled to
/// the Disney+ palette + Fraunces body for a softer reading experience.
class LegalDocumentScreen extends StatelessWidget {
  const LegalDocumentScreen({
    required this.title,
    required this.assetPath,
    super.key,
  });

  final String title;
  final String assetPath;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            child: Column(
              children: [
                _ScreenHeader(title: title),
                Expanded(
                  child: FutureBuilder<String>(
                    future: rootBundle.loadString(assetPath),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState != ConnectionState.done) {
                        return const Center(
                          child: CircularProgressIndicator(),
                        );
                      }
                      if (snapshot.hasError || !snapshot.hasData) {
                        return Center(
                          child: Text(
                            'Could not load $title.',
                            style: AppTypography.inter(
                              size: 14,
                              color: p.mutedForeground,
                            ),
                          ),
                        );
                      }
                      return Markdown(
                        data: snapshot.data!,
                        selectable: true,
                        padding:
                            const EdgeInsets.fromLTRB(20, 8, 20, 32),
                        styleSheet: MarkdownStyleSheet(
                          p: AppTypography.fraunces(
                            size: 16,
                            color: p.foreground,
                            height: 1.55,
                          ),
                          h1: AppTypography.fraunces(
                            size: 26,
                            weight: FontWeight.w600,
                            color: p.foreground,
                            letterSpacing: -0.4,
                            height: 1.3,
                          ),
                          h2: AppTypography.fraunces(
                            size: 20,
                            weight: FontWeight.w600,
                            color: p.foreground,
                            letterSpacing: -0.3,
                            height: 1.4,
                          ),
                          listBullet: AppTypography.inter(
                            size: 14,
                            color: p.foreground,
                          ),
                          a: AppTypography.inter(
                            size: 14,
                            weight: FontWeight.w500,
                            color: p.primary,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ScreenHeader extends StatelessWidget {
  const _ScreenHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: Material(
              color: p.card,
              shape: CircleBorder(side: BorderSide(color: p.border)),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => Navigator.of(context).maybePop(),
                child: Center(
                  child: Icon(Icons.chevron_left, size: 20, color: p.foreground),
                ),
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: Text(
                title,
                style: AppTypography.fraunces(
                  size: 22,
                  weight: FontWeight.w600,
                  color: p.foreground,
                  letterSpacing: -0.3,
                ),
              ),
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}
