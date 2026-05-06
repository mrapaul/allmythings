import 'package:all_my_things/application/providers/homes_provider.dart';
import 'package:all_my_things/domain/models/home.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/primary_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const List<String> _iconChoices = [
  '🏡', '🏠', '🏢', '🏖️', '🏔️', '🌳', '🛏️', '🛋️', '✨', '🌸',
];

/// Modal bottom sheet for picking the active home or adding a new one.
/// Single-home bootstrap: list shows one item, but "Add a home" is always
/// available — the data layer doesn't need any change to support more.
Future<void> showHomePickerSheet(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: false,
    builder: (_) => const _HomePickerSheet(),
  );
}

class _HomePickerSheet extends ConsumerStatefulWidget {
  const _HomePickerSheet();

  @override
  ConsumerState<_HomePickerSheet> createState() => _HomePickerSheetState();
}

class _HomePickerSheetState extends ConsumerState<_HomePickerSheet> {
  bool _adding = false;
  String _newIcon = '🏡';
  final TextEditingController _nameController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _selectHome(String id) async {
    await ref.read(homesProvider.notifier).setActiveHome(id);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _addHome() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    await ref
        .read(homesProvider.notifier)
        .addHome(name: name, icon: _newIcon);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final homesState = ref.watch(homesProvider).value ?? HomesState.bootstrap;
    final inset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Container(
        decoration: BoxDecoration(
          color: p.card,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(
            top: BorderSide(color: p.border),
            left: BorderSide(color: p.border),
            right: BorderSide(color: p.border),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: p.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Your homes',
              style: AppTypography.fraunces(
                size: 22,
                weight: FontWeight.w600,
                color: p.foreground,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: homesState.homes.length,
                itemBuilder: (_, i) {
                  final h = homesState.homes[i];
                  final isActive = h.id == homesState.activeHomeId;
                  return _HomeRow(
                    home: h,
                    isActive: isActive,
                    onTap: () => _selectHome(h.id),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            if (_adding)
              _AddCard(
                nameController: _nameController,
                icon: _newIcon,
                onIconChange: (i) => setState(() => _newIcon = i),
                onCancel: () => setState(() => _adding = false),
                onAdd: _addHome,
              )
            else
              GestureDetector(
                onTap: () => setState(() => _adding = true),
                child: Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: p.border,
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add, size: 18, color: p.primary),
                      const SizedBox(width: 8),
                      Text(
                        'Add a home',
                        style: AppTypography.inter(
                          size: 14,
                          weight: FontWeight.w600,
                          color: p.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _HomeRow extends StatelessWidget {
  const _HomeRow({
    required this.home,
    required this.isActive,
    required this.onTap,
  });
  final Home home;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: isActive ? p.glowPrimary.withValues(alpha: 0.33) : Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Text(home.icon, style: const TextStyle(fontSize: 26)),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  home.name,
                  style: AppTypography.fraunces(
                    size: 17,
                    weight: FontWeight.w500,
                    color: p.foreground,
                  ),
                ),
              ),
              if (isActive)
                Icon(Icons.check_rounded, size: 18, color: p.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddCard extends StatelessWidget {
  const _AddCard({
    required this.nameController,
    required this.icon,
    required this.onIconChange,
    required this.onCancel,
    required this.onAdd,
  });
  final TextEditingController nameController;
  final String icon;
  final ValueChanged<String> onIconChange;
  final VoidCallback onCancel;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: p.background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: p.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'NAME',
            style: AppTypography.inter(
              size: 12,
              weight: FontWeight.w500,
              color: p.mutedForeground,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          TextField(
            controller: nameController,
            autofocus: true,
            cursorColor: p.primary,
            style: AppTypography.inter(
              size: 15,
              weight: FontWeight.w500,
              color: p.foreground,
            ),
            decoration: InputDecoration(
              hintText: 'Beach House',
              hintStyle: AppTypography.inter(
                size: 14,
                color: p.mutedForeground,
              ),
              filled: true,
              fillColor: p.input,
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'ICON',
            style: AppTypography.inter(
              size: 12,
              weight: FontWeight.w500,
              color: p.mutedForeground,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final choice in _iconChoices)
                GestureDetector(
                  onTap: () => onIconChange(choice),
                  child: Container(
                    width: 44,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: choice == icon ? p.glowPrimary : p.muted,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(choice, style: const TextStyle(fontSize: 22)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: PrimaryButton(
                  label: 'Cancel',
                  style: PrimaryButtonStyle.secondary,
                  onPressed: onCancel,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: PrimaryButton(
                  label: 'Add home',
                  onPressed: onAdd,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
