import 'package:all_my_things/application/providers/homes_provider.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/domain/models/home.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

const List<String> _iconChoices = [
  '🏡', '🏠', '🏢', '🏖️', '🏔️', '🌳', '🛏️', '🛋️', '✨', '🌸',
];

/// Settings: manage homes (single-home mode + add-a-home), plus a
/// "danger zone" for emptying the active home. Mirrors design's
/// app/settings.tsx. Multi-home actions are wired but the bootstrap
/// state shows just one home.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String? _editingId;
  String _editName = '';
  String _editIcon = '🏡';

  void _startEdit(Home home) {
    setState(() {
      _editingId = home.id;
      _editName = home.name;
      _editIcon = home.icon;
    });
  }

  Future<void> _saveEdit() async {
    if (_editingId == null) return;
    final id = _editingId!;
    await ref.read(homesProvider.notifier).renameHome(id, _editName);
    await ref.read(homesProvider.notifier).setHomeIcon(id, _editIcon);
    setState(() => _editingId = null);
  }

  Future<void> _addHome() async {
    await ref
        .read(homesProvider.notifier)
        .addHome(name: 'New Home', icon: '🏡');
  }

  Future<void> _deleteHome(Home home) async {
    final homes =
        (ref.read(homesProvider).value ?? HomesState.bootstrap).homes;
    if (homes.length <= 1) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cannot delete'),
          content: const Text('You need at least one home.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }
    final ok = await _confirm(
      context,
      title: 'Delete ${home.name}?',
      body: 'Removes the home. Items inside will be orphaned until you '
          'empty the home from the danger zone.',
      destructive: true,
    );
    if (ok != true) return;
    await ref.read(homesProvider.notifier).removeHome(home.id);
  }

  Future<void> _emptyActiveHome() async {
    final ok = await _confirm(
      context,
      title: 'Empty current home?',
      body: 'All items in the active home will be removed. This cannot be undone.',
      destructive: true,
      confirmLabel: 'Empty home',
    );
    if (ok != true) return;
    final repo = await ref.read(inventoryRepositoryProvider.future);
    final items = await repo.getAllItems();
    for (final item in items) {
      await repo.deleteItem(item.id);
    }
    ref.invalidate(inventoryItemsProvider);
    ref.invalidate(inventoryStatsProvider);
  }

  Future<bool?> _confirm(
    BuildContext context, {
    required String title,
    required String body,
    bool destructive = false,
    String confirmLabel = 'Delete',
  }) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              confirmLabel,
              style: TextStyle(
                color: destructive ? ctx.palette.destructive : null,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final homes = ref.watch(homesProvider).value ?? HomesState.bootstrap;

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            child: Column(
              children: [
                _ScreenHeader(
                  title: 'Settings',
                  onBack: () => context.canPop()
                      ? context.pop()
                      : context.go('/items'),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                    children: [
                      _SectionLabel('YOUR HOMES'),
                      _Group(
                        children: [
                          for (var i = 0; i < homes.homes.length; i++) ...[
                            if (i > 0) const _RowDivider(),
                            if (_editingId == homes.homes[i].id)
                              _EditingRow(
                                name: _editName,
                                icon: _editIcon,
                                onNameChange: (v) => setState(() => _editName = v),
                                onIconChange: (v) => setState(() => _editIcon = v),
                                onCancel: () => setState(() => _editingId = null),
                                onSave: _saveEdit,
                              )
                            else
                              _HomeRow(
                                home: homes.homes[i],
                                isActive:
                                    homes.homes[i].id == homes.activeHomeId,
                                onEdit: () => _startEdit(homes.homes[i]),
                                onDelete: () => _deleteHome(homes.homes[i]),
                              ),
                          ],
                          const _RowDivider(),
                          Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: _addHome,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 14),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 36,
                                      height: 36,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: p.glowMint,
                                        shape: BoxShape.circle,
                                      ),
                                      child: Icon(Icons.add,
                                          size: 18, color: p.foreground),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Text(
                                        'Add a home',
                                        style: AppTypography.fraunces(
                                          size: 15,
                                          weight: FontWeight.w500,
                                          color: p.primary,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      _SectionLabel('DANGER ZONE'),
                      _Group(
                        children: [
                          Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: _emptyActiveHome,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 14),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 36,
                                      height: 36,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: p.glowAccent,
                                        shape: BoxShape.circle,
                                      ),
                                      child: Icon(Icons.delete_outline,
                                          size: 16, color: p.destructive),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Empty current home',
                                            style: AppTypography.fraunces(
                                              size: 15,
                                              weight: FontWeight.w500,
                                              color: p.destructive,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            'Removes every item in the active home',
                                            style: AppTypography.inter(
                                              size: 12,
                                              color: p.mutedForeground,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      Center(
                        child: Text(
                          'Photos are stored on this device only.',
                          textAlign: TextAlign.center,
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
  const _ScreenHeader({required this.title, required this.onBack});
  final String title;
  final VoidCallback onBack;

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
                onTap: onBack,
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

class _RowDivider extends StatelessWidget {
  const _RowDivider();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 14),
      child: Container(height: 1, color: context.palette.border),
    );
  }
}

class _HomeRow extends ConsumerWidget {
  const _HomeRow({
    required this.home,
    required this.isActive,
    required this.onEdit,
    required this.onDelete,
  });
  final Home home;
  final bool isActive;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          Text(home.icon, style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    text: home.name,
                    style: AppTypography.fraunces(
                      size: 15,
                      weight: FontWeight.w500,
                      color: p.foreground,
                    ),
                    children: [
                      if (isActive)
                        TextSpan(
                          text: '  · active',
                          style: AppTypography.inter(
                            size: 11,
                            weight: FontWeight.w500,
                            color: p.primary,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Edit',
            icon: Icon(Icons.edit_outlined, size: 16, color: p.mutedForeground),
            onPressed: onEdit,
          ),
          IconButton(
            tooltip: 'Delete',
            icon: Icon(Icons.delete_outline, size: 16, color: p.destructive),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

class _EditingRow extends StatefulWidget {
  const _EditingRow({
    required this.name,
    required this.icon,
    required this.onNameChange,
    required this.onIconChange,
    required this.onCancel,
    required this.onSave,
  });

  final String name;
  final String icon;
  final ValueChanged<String> onNameChange;
  final ValueChanged<String> onIconChange;
  final VoidCallback onCancel;
  final VoidCallback onSave;

  @override
  State<_EditingRow> createState() => _EditingRowState();
}

class _EditingRowState extends State<_EditingRow> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.name);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final choice in _iconChoices)
                GestureDetector(
                  onTap: () => widget.onIconChange(choice),
                  child: Container(
                    width: 38,
                    height: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: choice == widget.icon ? p.glowPrimary : p.muted,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(choice, style: const TextStyle(fontSize: 18)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _controller,
            onChanged: widget.onNameChange,
            cursorColor: p.primary,
            style: AppTypography.inter(
              size: 14,
              weight: FontWeight.w500,
              color: p.foreground,
            ),
            decoration: InputDecoration(
              hintText: 'Home name',
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
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(42),
                    side: BorderSide(color: p.border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  onPressed: widget.onCancel,
                  child: Text(
                    'Cancel',
                    style: AppTypography.inter(
                      size: 13,
                      weight: FontWeight.w600,
                      color: p.foreground,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: p.primary,
                    foregroundColor: p.primaryForeground,
                    minimumSize: const Size.fromHeight(42),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  onPressed: widget.onSave,
                  child: Text(
                    'Save',
                    style: AppTypography.inter(
                      size: 13,
                      weight: FontWeight.w600,
                      color: p.primaryForeground,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
