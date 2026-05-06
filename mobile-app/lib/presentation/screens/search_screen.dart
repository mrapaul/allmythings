import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/utils/inventory_summary.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:all_my_things/presentation/widgets/item_card.dart';
import 'package:all_my_things/presentation/widgets/masonry_grid.dart';
import 'package:all_my_things/presentation/widgets/responsive.dart';
import 'package:all_my_things/presentation/widgets/search_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Standalone search route — focused query field + masonry results.
/// The home screen has search inline, so this is mostly a deep-link
/// destination from external triggers (notifications, share sheet…).
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = context.responsive;
    final q = _query.trim();
    final resultsAsync =
        q.isEmpty ? null : ref.watch(searchResultsProvider(q));

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: r.contentMaxWidth),
                child: Column(
                  children: [
                    Padding(
                      padding: EdgeInsets.fromLTRB(r.gutter, 4, r.gutter, 12),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 44,
                            height: 44,
                            child: Material(
                              color: p.card,
                              shape: CircleBorder(
                                  side: BorderSide(color: p.border)),
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: () => context.canPop()
                                    ? context.pop()
                                    : context.go('/items'),
                                child: Center(
                                  child: Icon(Icons.chevron_left,
                                      size: 20, color: p.foreground),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: SearchHeader(
                              controller: _controller,
                              focusNode: _focusNode,
                              onChanged: (v) => setState(() => _query = v),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: resultsAsync == null
                          ? _IdleHint()
                          : resultsAsync.when(
                              loading: () => const Center(
                                child: CircularProgressIndicator(),
                              ),
                              error: (e, _) => Center(
                                child: Text(
                                  'Search failed: $e',
                                  style: AppTypography.inter(
                                    size: 14,
                                    color: p.mutedForeground,
                                  ),
                                ),
                              ),
                              data: (items) => _Results(items: items),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IdleHint extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 36),
        child: Text(
          'Search for an item, room, or detail — color, brand, anything tagged.',
          textAlign: TextAlign.center,
          style: AppTypography.inter(
            size: 14,
            color: p.mutedForeground,
            height: 1.5,
          ),
        ),
      ),
    );
  }
}

class _Results extends StatelessWidget {
  const _Results({required this.items});
  final List<InventoryItem> items;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final r = context.responsive;
    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 36),
          child: Text(
            'Nothing matches that search.',
            textAlign: TextAlign.center,
            style: AppTypography.inter(size: 14, color: p.mutedForeground),
          ),
        ),
      );
    }

    final summaries = {
      for (final it in items) it.id: InventorySummary.fromItem(it)
    };
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: r.gutter),
      child: SingleChildScrollView(
        child: MasonryGrid<InventoryItem>(
          items: items,
          columns: r.columns,
          gap: r.cardGap,
          aspectRatioFor: (it) => summaries[it.id]?.aspectRatio ?? 1,
          tileBuilder: (ctx, item, _) {
            final s = summaries[item.id] ?? const InventorySummary(
                label: '', category: 'Other', aspectRatio: 1, tagCount: 0);
            return ItemCard(
              heroTag: 'search-${item.id}',
              thumbnailPath: item.thumbnailPath,
              label: s.label,
              category: s.category,
              status: ItemCardStatus.completed,
              onTap: () => ctx.push('/item/${item.id}'),
              onLongPress: () {},
            );
          },
        ),
      ),
    );
  }
}
