import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

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
                _ScreenHeader(title: 'About'),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
                    children: [
                      Center(
                        child: Container(
                          width: 100,
                          height: 100,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [p.primary, const Color(0xFF4A3A9C)],
                            ),
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: p.primary.withValues(alpha: 0.4),
                                offset: const Offset(0, 10),
                                blurRadius: 18,
                              ),
                            ],
                          ),
                          child: Icon(Icons.auto_awesome,
                              size: 48, color: p.primaryForeground),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Center(
                        child: Text(
                          'All My Things',
                          style: AppTypography.fraunces(
                            size: 28,
                            weight: FontWeight.w600,
                            color: p.foreground,
                            letterSpacing: -0.4,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Center(
                        child: Text(
                          'Version 0.1.0 (Beta)',
                          style: AppTypography.inter(
                            size: 13,
                            color: p.mutedForeground,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: p.card,
                          border: Border.all(color: p.border),
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Text(
                          'A boutique-magic home inventory app: snap a room, '
                          'and the catalogue writes itself. Each photo is '
                          'identified, tagged, and tucked into a searchable '
                          'feed of everything you own.',
                          textAlign: TextAlign.center,
                          style: AppTypography.fraunces(
                            size: 16,
                            weight: FontWeight.w400,
                            color: p.foreground,
                            height: 1.5,
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      _LinkRow(
                        icon: Icons.privacy_tip_outlined,
                        label: 'Privacy Policy',
                        onTap: () => context.push('/profile/privacy'),
                      ),
                      const SizedBox(height: 10),
                      _LinkRow(
                        icon: Icons.description_outlined,
                        label: 'Terms of Service',
                        onTap: () => context.push('/profile/terms'),
                      ),
                      const SizedBox(height: 32),
                      Center(
                        child: Text(
                          '© 2026 Visual Home Inventory Manager',
                          style: AppTypography.inter(
                            size: 12,
                            color: p.mutedForeground,
                          ),
                        ),
                      ),
                    ],
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

class _LinkRow extends StatelessWidget {
  const _LinkRow({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: p.card,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: p.border),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: p.foreground),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: AppTypography.inter(
                    size: 14,
                    weight: FontWeight.w500,
                    color: p.foreground,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, size: 16, color: p.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }
}
