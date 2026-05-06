import 'package:all_my_things/application/providers/homes_provider.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/application/providers/profile_provider.dart';
import 'package:all_my_things/domain/models/user_profile.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:all_my_things/presentation/widgets/primary_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Profile: avatar hero + display name / initials editor. Mirrors
/// design's app/profile.tsx; the homes section moves to /settings.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _nameController = TextEditingController();
  final _initialsController = TextEditingController();
  bool _saved = false;
  bool _seeded = false;

  @override
  void dispose() {
    _nameController.dispose();
    _initialsController.dispose();
    super.dispose();
  }

  void _seed(UserProfile profile) {
    if (_seeded) return;
    _nameController.text = profile.name;
    _initialsController.text = profile.initials;
    _seeded = true;
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    var initials = _initialsController.text.trim();
    if (initials.isEmpty && name.isNotEmpty) {
      initials = name.length >= 2 ? name.substring(0, 2) : name;
    }
    await ref.read(profileProvider.notifier).updateProfile(
          name: name.isEmpty ? 'You' : name,
          initials: initials.isEmpty ? 'Y' : initials.toUpperCase(),
        );
    if (mounted) {
      setState(() => _saved = true);
      Future<void>.delayed(const Duration(milliseconds: 1200), () {
        if (mounted) setState(() => _saved = false);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final profile = ref.watch(profileProvider).value ?? UserProfile.defaults;
    _seed(profile);
    final homes = ref.watch(homesProvider).value ?? HomesState.bootstrap;
    final stats = ref.watch(inventoryStatsProvider).value;
    final totalItems = stats?.totalItems ?? 0;

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            child: Column(
              children: [
                _ScreenHeader(title: 'Profile'),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                    children: [
                      _Hero(
                        initials: _initialsController.text.isEmpty
                            ? profile.initials
                            : _initialsController.text,
                        name: _nameController.text.isEmpty
                            ? profile.name
                            : _nameController.text,
                        homesCount: homes.homes.length,
                        itemsCount: totalItems,
                      ),
                      const SizedBox(height: 18),
                      _SectionLabel('YOUR DETAILS'),
                      _Group(
                        children: [
                          _Field(
                            label: 'Display name',
                            child: TextField(
                              controller: _nameController,
                              cursorColor: p.primary,
                              onChanged: (_) => setState(() {}),
                              style: AppTypography.inter(
                                size: 14,
                                weight: FontWeight.w500,
                                color: p.foreground,
                              ),
                              decoration: InputDecoration(
                                hintText: 'Your name',
                                hintStyle: AppTypography.inter(
                                  size: 14,
                                  color: p.mutedForeground,
                                ),
                                filled: true,
                                fillColor: p.input,
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 12),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide.none,
                                ),
                              ),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(left: 14),
                            child: Container(height: 1, color: p.border),
                          ),
                          _Field(
                            label: 'Initials',
                            child: TextField(
                              controller: _initialsController,
                              maxLength: 2,
                              textCapitalization:
                                  TextCapitalization.characters,
                              cursorColor: p.primary,
                              onChanged: (v) => setState(() {
                                _initialsController.value = TextEditingValue(
                                  text: v.toUpperCase(),
                                  selection:
                                      TextSelection.collapsed(offset: v.length),
                                );
                              }),
                              style: AppTypography.inter(
                                size: 14,
                                weight: FontWeight.w500,
                                color: p.foreground,
                              ),
                              decoration: InputDecoration(
                                hintText: '2 letters',
                                hintStyle: AppTypography.inter(
                                  size: 14,
                                  color: p.mutedForeground,
                                ),
                                counterText: '',
                                filled: true,
                                fillColor: p.input,
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 12),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide.none,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      PrimaryButton(
                        label: _saved ? 'Saved' : 'Save profile',
                        icon: _saved ? Icons.check_rounded : Icons.save_outlined,
                        onPressed: _save,
                      ),
                      const SizedBox(height: 18),
                      _LegalLinks(),
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
                onTap: () {
                  if (Navigator.canPop(context)) {
                    Navigator.pop(context);
                  } else {
                    context.go('/items');
                  }
                },
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

class _Hero extends StatelessWidget {
  const _Hero({
    required this.initials,
    required this.name,
    required this.homesCount,
    required this.itemsCount,
  });
  final String initials;
  final String name;
  final int homesCount;
  final int itemsCount;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return SizedBox(
      height: 220,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            top: 0,
            child: Container(
              width: 220,
              height: 220,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: p.glowPrimary.withValues(alpha: 0.5),
              ),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 96,
                height: 96,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: p.card,
                  shape: BoxShape.circle,
                  border: Border.all(color: p.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      offset: const Offset(0, 8),
                      blurRadius: 18,
                    ),
                  ],
                ),
                child: Text(
                  (initials.isEmpty ? 'Y' : initials).substring(
                      0, initials.length > 2 ? 2 : initials.length).toUpperCase(),
                  style: AppTypography.fraunces(
                    size: 32,
                    weight: FontWeight.w600,
                    color: p.foreground,
                    letterSpacing: 1,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                name,
                style: AppTypography.fraunces(
                  size: 22,
                  weight: FontWeight.w600,
                  color: p.foreground,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$homesCount ${homesCount == 1 ? "home" : "homes"} · $itemsCount items catalogued',
                style: AppTypography.inter(
                  size: 12,
                  color: p.mutedForeground,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.only(left: 12, bottom: 8, top: 18),
      child: Text(
        text,
        style: AppTypography.inter(
          size: 11,
          weight: FontWeight.w600,
          color: p.mutedForeground,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: p.card,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(children: children),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: AppTypography.inter(
              size: 11,
              weight: FontWeight.w500,
              color: p.mutedForeground,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

class _LegalLinks extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final tile = (String label, String route) => Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => context.push(route),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
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

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: p.card,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        children: [
          tile('About', '/profile/about'),
          Padding(
            padding: const EdgeInsets.only(left: 14),
            child: Container(height: 1, color: p.border),
          ),
          tile('Privacy Policy', '/profile/privacy'),
          Padding(
            padding: const EdgeInsets.only(left: 14),
            child: Container(height: 1, color: p.border),
          ),
          tile('Terms of Service', '/profile/terms'),
        ],
      ),
    );
  }
}
