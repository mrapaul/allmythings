import 'dart:io';
import 'dart:math' as math;

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Highly refined, slick Instagram Profile-style feed
class InventoryFeedScreen extends ConsumerWidget {
  const InventoryFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(inventoryItemsProvider);
    final statsAsync = ref.watch(inventoryStatsProvider);

    return Scaffold(
      key: const Key('inventory-feed-screen'),
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        title: const Text(
          'visual_vault',
          style: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w900,
            fontSize: 26,
            letterSpacing: -1.5,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_box_outlined, color: Colors.black, size: 26),
            onPressed: () => context.push('/camera'),
          ),
          IconButton(
            icon: const Icon(Icons.menu_rounded, color: Colors.black, size: 26),
            onPressed: () {},
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(inventoryItemsProvider);
          ref.invalidate(inventoryStatsProvider);
        },
        color: Colors.black,
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          slivers: [
            // Profile Header
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _RefinedProfileAvatar(),
                        const SizedBox(width: 32),
                        Expanded(
                          child: statsAsync.when(
                            data: (stats) => Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                _ProfileStat(label: 'items', value: stats.totalItems.toString()),
                                _ProfileStat(label: 'labels', value: stats.totalLabels.toString()),
                                _ProfileStat(label: 'types', value: stats.totalCategories.toString()),
                              ],
                            ),
                            loading: () => const Center(child: CupertinoActivityIndicator()),
                            error: (_, __) => const SizedBox.shrink(),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Visual Vault • Home Intelligence',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Automated visual inventory & classification.',
                      style: TextStyle(fontSize: 14, color: Colors.grey.shade700, height: 1.4),
                    ),
                    const SizedBox(height: 24),
                    _RefinedHeaderButtons(onSearch: () => context.push('/search')),
                  ],
                ),
              ),
            ),

            // Tab Bar
            SliverPersistentHeader(
              pinned: true,
              delegate: _SliverAppBarDelegate(
                minHeight: 46,
                maxHeight: 46,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border(
                      top: BorderSide(color: Colors.grey.shade100),
                      bottom: BorderSide(color: Colors.grey.shade100),
                    ),
                  ),
                  child: const Row(
                    children: [
                      _RefinedTabItem(icon: Icons.grid_on_rounded, isActive: true),
                      _RefinedTabItem(icon: Icons.video_library_outlined, isActive: false),
                      _RefinedTabItem(icon: Icons.assignment_ind_outlined, isActive: false),
                    ],
                  ),
                ),
              ),
            ),

            // The Grid
            itemsAsync.when(
              data: (items) {
                if (items.isEmpty) {
                  return const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Text('Vault is empty.', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w500)),
                    ),
                  );
                }

                return SliverPadding(
                  padding: const EdgeInsets.only(top: 1),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                      childAspectRatio: 1.0,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        return _RefinedGridItem(item: items[index]);
                      },
                      childCount: items.length,
                    ),
                  ),
                );
              },
              loading: () => const SliverFillRemaining(
                child: Center(child: CupertinoActivityIndicator()),
              ),
              error: (error, _) => SliverFillRemaining(
                child: Center(child: Text('Error: $error')),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
    );
  }
}

class _RefinedProfileAvatar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.grey.shade200, width: 1),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 4)),
        ],
      ),
      child: ClipOval(
        child: Container(
          color: const Color(0xFFFBFBFB),
          child: const Icon(Icons.shield_moon_rounded, size: 44, color: Color(0xFF2C3E50)),
        ),
      ),
    );
  }
}

class _ProfileStat extends StatelessWidget {
  const _ProfileStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.5),
        ),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }
}

class _RefinedHeaderButtons extends StatelessWidget {
  const _RefinedHeaderButtons({required this.onSearch});
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _HeaderButton(
            label: 'Search Collection',
            onTap: onSearch,
          ),
        ),
        const SizedBox(width: 8),
        _HeaderButton(
          icon: Icons.share_rounded,
          onTap: () {},
        ),
        const SizedBox(width: 8),
        _HeaderButton(
          icon: Icons.person_add_rounded,
          onTap: () {},
        ),
      ],
    );
  }
}

class _HeaderButton extends StatelessWidget {
  const _HeaderButton({this.label, this.icon, required this.onTap});
  final String? label;
  final IconData? icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 34,
        decoration: BoxDecoration(
          color: const Color(0xFFFAFAFA),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade200),
        ),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: label != null
            ? Text(label!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))
            : Icon(icon, size: 18, color: Colors.black),
      ),
    );
  }
}

class _RefinedTabItem extends StatelessWidget {
  const _RefinedTabItem({required this.icon, required this.isActive});
  final IconData icon;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: BoxDecoration(
          border: isActive ? const Border(bottom: BorderSide(color: Colors.black, width: 1.5)) : null,
        ),
        child: Icon(icon, size: 24, color: isActive ? Colors.black : Colors.grey.shade300),
      ),
    );
  }
}

class _RefinedGridItem extends StatelessWidget {
  const _RefinedGridItem({required this.item});
  final InventoryItem item;

  @override
  Widget build(BuildContext context) {
    final isPending = item.status == 'pending';
    final isUnconfirmed = item.status == 'unconfirmed';
    final isFailed = item.status == 'failed';

    return GestureDetector(
      onTap: isPending ? null : () => context.push('/item/${item.id}'),
      child: Hero(
        tag: 'item-${item.id}',
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: AppTheme.surfaceLight,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 4)),
            ],
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (item.thumbnailPath.isNotEmpty)
                Image.file(File(item.thumbnailPath), fit: BoxFit.cover)
              else
                const Center(child: Icon(Icons.image_not_supported, color: Colors.grey)),
              
              if (isPending)
                Container(
                  color: Colors.black26,
                  child: const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CupertinoActivityIndicator(color: Colors.white),
                        SizedBox(height: 8),
                        Text(
                          'IDENTIFYING',
                          key: Key('identifying-badge'),
                          style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1),
                        ),
                      ],
                    ),
                  ),
                ),
                
              if (isUnconfirmed)
                Positioned(
                  top: 8,
                  right: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.accentGreen,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'NEW',
                      style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),

              if (isFailed)
                Container(
                  color: Colors.black45,
                  child: const Center(
                    child: Icon(Icons.error_outline_rounded, color: Colors.white, size: 32),
                  ),
                ),

              // Subtle overlay for better grid separation
              Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.02)))),
            ],
          ),
        ),
      ),
    );
  }
}

class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  _SliverAppBarDelegate({required this.minHeight, required this.maxHeight, required this.child});
  final double minHeight;
  final double maxHeight;
  final Widget child;
  @override double get minExtent => minHeight;
  @override double get maxExtent => math.max(maxHeight, minHeight);
  @override Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => SizedBox.expand(child: child);
  @override bool shouldRebuild(_SliverAppBarDelegate oldDelegate) => maxHeight != oldDelegate.maxHeight || minHeight != oldDelegate.minHeight || child != oldDelegate.child;
}
