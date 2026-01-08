import 'dart:io';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/screens/smart_albums_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Screen showing items in a specific smart album (by label type)
class SmartAlbumDetailScreen extends ConsumerWidget {
  const SmartAlbumDetailScreen({
    required this.label,
    super.key,
  });

  final String label;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albumsAsync = ref.watch(smartAlbumsProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: albumsAsync.when(
        data: (albums) {
          final album = albums.where((a) => a.label == label).firstOrNull;
          if (album == null) {
            return const Center(child: Text('Album not found'));
          }

          return CustomScrollView(
            slivers: [
              // App bar with album info
              SliverAppBar(
                expandedHeight: 120,
                pinned: true,
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                flexibleSpace: FlexibleSpaceBar(
                  title: Text(
                    album.label,
                    style: const TextStyle(
                      color: Colors.black,
                      fontWeight: FontWeight.w600,
                      fontSize: 18,
                    ),
                  ),
                  background: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          (album.color ?? Colors.grey).withAlpha(30),
                          Colors.white,
                        ],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        album.icon ?? Icons.category,
                        size: 48,
                        color: (album.color ?? Colors.grey).withAlpha(100),
                      ),
                    ),
                  ),
                ),
              ),

              // Items count header
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Text(
                    '${album.itemCount} ${album.itemCount == 1 ? 'item' : 'items'}',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ),
              ),

              // Items grid
              if (album.items.isEmpty)
                const SliverFillRemaining(
                  child: Center(child: Text('No items in this album')),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.all(1),
                  sliver: SliverGrid(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 1,
                      mainAxisSpacing: 1,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final item = album.items[index];
                        return _SmartAlbumItemTile(item: item);
                      },
                      childCount: album.items.length,
                    ),
                  ),
                ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Error: $error')),
      ),
    );
  }
}

/// Grid item tile for smart album detail view
class _SmartAlbumItemTile extends StatelessWidget {
  const _SmartAlbumItemTile({required this.item});

  final InventoryItem item;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/item/${item.id}'),
      child: ColoredBox(
        color: Colors.grey.shade100,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Thumbnail
            if (item.thumbnailPath.isNotEmpty) Image.file(
                    File(item.thumbnailPath),
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      return Container(
                        color: Colors.grey.shade200,
                        child:
                            const Icon(Icons.broken_image, color: Colors.grey),
                      );
                    },
                  ) else Container(
                    color: Colors.grey.shade200,
                    child: const Icon(Icons.image, color: Colors.grey),
                  ),

            // Bottom gradient overlay
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                height: 24,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [
                      Colors.black.withAlpha((255 * 0.6).round()),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
