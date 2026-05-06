import 'dart:async';
import 'dart:io';

import 'package:all_my_things/application/providers/homes_provider.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/utils/inventory_summary.dart';
import 'package:all_my_things/presentation/widgets/action_capsule.dart';
import 'package:all_my_things/presentation/widgets/category_strip.dart';
import 'package:all_my_things/presentation/widgets/empty_state.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:all_my_things/presentation/widgets/home_picker_sheet.dart';
import 'package:all_my_things/presentation/widgets/item_card.dart';
import 'package:all_my_things/presentation/widgets/masonry_grid.dart';
import 'package:all_my_things/presentation/widgets/quick_actions_sheet.dart';
import 'package:all_my_things/presentation/widgets/responsive.dart';
import 'package:all_my_things/presentation/widgets/search_header.dart';
import 'package:all_my_things/presentation/widgets/top_bar.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

const String _kAllCategory = '__all__';

/// The home feed: TopBar + persistent SearchHeader + CategoryStrip
/// (live counts + sort cycle) + aspect-aware MasonryGrid + floating
/// ActionCapsule. Mirrors design's app/index.tsx.
class InventoryFeedScreen extends ConsumerStatefulWidget {
  const InventoryFeedScreen({super.key});

  @override
  ConsumerState<InventoryFeedScreen> createState() =>
      _InventoryFeedScreenState();
}

class _InventoryFeedScreenState extends ConsumerState<InventoryFeedScreen> {
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final ImagePicker _picker = ImagePicker();

  String _activeCategory = _kAllCategory;
  SortMode _sort = SortMode.newest;
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _onLibrary() async {
    final XFile? image =
        await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (image == null || !mounted) return;
    context.go('/scene-review', extra: File(image.path));
  }

  void _onCamera() {
    context.push('/camera');
  }

  void _onSearchToggle() {
    unawaited(_scrollController.animateTo(
      0,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    ));
    Future<void>.delayed(const Duration(milliseconds: 220), () {
      if (mounted) _searchFocusNode.requestFocus();
    });
  }

  Future<void> _onItemAction(InventoryItem item, QuickAction action) async {
    switch (action) {
      case QuickAction.edit:
        if (mounted) context.push('/item/${item.id}');
        break;
      case QuickAction.move:
        // Placeholder for multi-home — in single-home mode the action sheet
        // never offers Move. Wired here so the sheet stays straightforward
        // to extend.
        break;
      case QuickAction.delete:
        await _confirmDelete(item);
        break;
    }
  }

  Future<void> _confirmDelete(InventoryItem item) async {
    final summary = InventorySummary.fromItem(item);
    final label = summary.label.isEmpty ? 'this item' : '"${summary.label}"';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete item?'),
        content: Text('$label will be removed from this home.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              'Delete',
              style: TextStyle(color: ctx.palette.destructive),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      final repo =
          await ref.read(inventoryRepositoryProvider.future);
      await repo.deleteItem(item.id);
      ref.invalidate(inventoryItemsProvider);
      ref.invalidate(inventoryStatsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = context.responsive;
    final itemsAsync = ref.watch(inventoryItemsProvider);
    final activeHome = (ref.watch(homesProvider).value ?? HomesState.bootstrap)
        .activeHome;

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            top: false,
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: r.contentMaxWidth),
                child: Column(
                  children: [
                    TopBar(onPickHome: () => showHomePickerSheet(context)),
                    Expanded(
                      child: itemsAsync.when(
                        loading: () =>
                            const _LoadingShell(),
                        error: (err, _) => _ErrorShell(error: err),
                        data: (items) => _buildBody(items, activeHome.icon),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Pin the capsule absolutely to the bottom edge — Positioned
          // (left: 0, right: 0, bottom: 0) is unambiguous; Align inside
          // a non-positioned Stack child can be ambiguous on some iOS
          // layout passes. The capsule's own Padding handles safe-area
          // bottom inset.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: ActionCapsule(
                onLibrary: _onLibrary,
                onCamera: _onCamera,
                onSearchToggle: _onSearchToggle,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody(List<InventoryItem> items, String activeIcon) {
    final r = context.responsive;
    final summaries = {for (final it in items) it.id: InventorySummary.fromItem(it)};

    final categories = _buildCategories(items, summaries);
    final visible = _filterAndSort(items, summaries);

    final isFiltering = _query.isNotEmpty || _activeCategory != _kAllCategory;
    final headerTitle = _query.isNotEmpty
        ? 'Results · ${visible.length}'
        : _activeCategory != _kAllCategory
            ? '$_activeCategory · ${visible.length}'
            : 'Collection';

    return ListView(
      controller: _scrollController,
      padding: EdgeInsets.fromLTRB(
        r.gutter,
        0,
        r.gutter,
        MediaQuery.paddingOf(context).bottom + 140,
      ),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        SearchHeader(
          controller: _searchController,
          focusNode: _searchFocusNode,
          onChanged: (v) => setState(() => _query = v),
        ),
        if (items.isNotEmpty) ...[
          const SizedBox(height: 14),
          CategoryStrip(
            categories: categories,
            activeKey: _activeCategory,
            onChange: (key) => setState(() => _activeCategory = key),
            sort: _sort,
            onCycleSort: () => setState(() => _sort = cycleSort(_sort)),
          ),
        ],
        if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 60),
            child: EmptyState(
              emoji: isFiltering ? '🔎' : activeIcon,
              title: isFiltering ? 'Nothing matches' : 'A blank canvas',
              body: isFiltering
                  ? 'Try a different search or tap All to see everything.'
                  : 'Tap the camera below to capture your first piece. Each photo is catalogued automatically.',
              actionLabel: isFiltering ? 'Clear filters' : null,
              onAction: isFiltering
                  ? () {
                      setState(() {
                        _query = '';
                        _searchController.clear();
                        _activeCategory = _kAllCategory;
                      });
                    }
                  : null,
            ),
          )
        else ...[
          const SizedBox(height: 22),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              headerTitle,
              style: AppTypography.fraunces(
                size: r.isCompact ? 22 : 28,
                weight: FontWeight.w500,
                color: context.palette.foreground,
                letterSpacing: -0.4,
              ),
            ),
          ),
          const SizedBox(height: 14),
          MasonryGrid<InventoryItem>(
            items: visible,
            columns: r.columns,
            gap: r.cardGap,
            aspectRatioFor: (item) =>
                summaries[item.id]?.aspectRatio ?? 1.0,
            tileBuilder: (ctx, item, _) {
              final s = summaries[item.id] ?? const InventorySummary(
                  label: '', category: 'Other', aspectRatio: 1, tagCount: 0);
              return ItemCard(
                heroTag: 'item-${item.id}',
                thumbnailPath: item.thumbnailPath,
                label: s.label,
                category: s.category,
                status: _statusFromItem(item),
                onTap: () => context.push('/item/${item.id}'),
                onLongPress: () async {
                  final action = await showQuickActionsSheet(
                    context,
                    itemLabel: s.label,
                  );
                  if (action != null && mounted) {
                    await _onItemAction(item, action);
                  }
                },
              );
            },
          ),
        ],
      ],
    );
  }

  ItemCardStatus _statusFromItem(InventoryItem item) {
    return switch (item.status) {
      'pending' => ItemCardStatus.pending,
      'unconfirmed' => ItemCardStatus.unconfirmed,
      'flagged' => ItemCardStatus.flagged,
      'failed' => ItemCardStatus.failed,
      _ => ItemCardStatus.completed,
    };
  }

  List<CategoryItem> _buildCategories(
    List<InventoryItem> items,
    Map<String, InventorySummary> summaries,
  ) {
    final counts = <String, int>{};
    for (final item in items) {
      final c = summaries[item.id]?.category ?? 'Other';
      counts[c] = (counts[c] ?? 0) + 1;
    }
    final sorted = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return [
      CategoryItem(key: _kAllCategory, label: 'All', count: items.length),
      for (final entry in sorted)
        CategoryItem(key: entry.key, label: entry.key, count: entry.value),
    ];
  }

  List<InventoryItem> _filterAndSort(
    List<InventoryItem> items,
    Map<String, InventorySummary> summaries,
  ) {
    var out = items;
    if (_activeCategory != _kAllCategory) {
      out = out
          .where(
            (it) => (summaries[it.id]?.category ?? 'Other') == _activeCategory,
          )
          .toList();
    }
    if (_query.trim().isNotEmpty) {
      final q = _query.toLowerCase();
      out = out.where((it) {
        final s = summaries[it.id];
        if (s == null) return false;
        return s.label.toLowerCase().contains(q) ||
            s.category.toLowerCase().contains(q);
      }).toList();
    }
    out = [...out];
    switch (_sort) {
      case SortMode.newest:
        out.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      case SortMode.oldest:
        out.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      case SortMode.az:
        out.sort((a, b) {
          final la = summaries[a.id]?.label ?? '';
          final lb = summaries[b.id]?.label ?? '';
          return la.toLowerCase().compareTo(lb.toLowerCase());
        });
    }
    return out;
  }
}

class _LoadingShell extends StatelessWidget {
  const _LoadingShell();
  @override
  Widget build(BuildContext context) =>
      const Center(child: CupertinoActivityIndicator());
}

class _ErrorShell extends StatelessWidget {
  const _ErrorShell({required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          'Something went wrong loading your collection.\n\n$error',
          textAlign: TextAlign.center,
          style: AppTypography.inter(size: 14, color: p.mutedForeground),
        ),
      ),
    );
  }
}
