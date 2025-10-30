import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io';
import 'dart:convert';
import '../../application/providers/inventory_providers.dart';
import '../../data/database/app_database.dart';
import '../../domain/models/detection.dart';
import '../common/loading_indicator.dart';
import '../common/error_view.dart';
import '../common/custom_app_bar.dart'; // Added import
import '../items/item_detail_screen.dart';
import '../theme/app_theme.dart';

/// Modern inventory feed with grid layout and smooth animations
class InventoryFeedScreen extends ConsumerWidget {
  const InventoryFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inventoryState = ref.watch(inventoryItemsProvider);

    return Scaffold(
      appBar: const CustomAppBar(title: 'Home Inventory'), // Added CustomAppBar
      body: inventoryState.when(
        data: (items) {
          // Always show grid, even when empty
          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.camera_alt_rounded,
                    size: 80,
                    color: AppTheme.textTertiary.withOpacity(0.5),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No Items Yet',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary.withOpacity(0.7),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tap the camera icon to add your first item!',
                    style: TextStyle(
                      fontSize: 16,
                      color: AppTheme.textSecondary.withOpacity(0.7),
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(inventoryItemsProvider);
            },
            color: AppTheme.primaryBlack,
            child: CustomScrollView(
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.only(
                    left: 16,
                    right: 16,
                    top: 12,
                    bottom: 100, // Extra space for FAB
                  ),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 0.85,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final item = items[index];
                        return _ModernInventoryCard(
                          item: item,
                          index: index,
                        );
                      },
                      childCount: items.length,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const ShimmerGrid(
          itemCount: 12,
          crossAxisCount: 2,
          padding: EdgeInsets.all(16),
        ),
        error: (error, stack) => ErrorView(
          message: 'Failed to load inventory',
          subtitle: 'Something went wrong while loading your items',
          onRetry: () => ref.invalidate(inventoryItemsProvider),
        ),
      ),
    );
  }
}

/// Modern inventory card with hero animation and smooth effects
class _ModernInventoryCard extends StatefulWidget {
  final InventoryItem item;
  final int index;

  const _ModernInventoryCard({
    required this.item,
    required this.index,
  });

  @override
  State<_ModernInventoryCard> createState() => _ModernInventoryCardState();
}

class _ModernInventoryCardState extends State<_ModernInventoryCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 150),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    // Staggered entrance animation
    Future.delayed(Duration(milliseconds: widget.index * 50), () {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.0, end: 1.0),
      duration: Duration(milliseconds: 400 + (widget.index * 50)),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, 20 * (1 - value)),
            child: child,
          ),
        );
      },
      child: ScaleTransition(
        scale: _scaleAnimation,
        child: GestureDetector(
          onTapDown: (_) {
            setState(() => _isPressed = true);
            _controller.forward();
          },
          onTapUp: (_) {
            setState(() => _isPressed = false);
            _controller.reverse();
            _navigateToDetail();
          },
          onTapCancel: () {
            setState(() => _isPressed = false);
            _controller.reverse();
          },
          child: Hero(
            tag: 'item_${widget.item.id}',
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: _isPressed ? AppTheme.shadowSm : AppTheme.shadowMd,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Image Section
                    Expanded(
                      flex: 3,
                      child: _buildImage(),
                    ),
                    // Info Section
                    Expanded(
                      flex: 2,
                      child: _buildInfo(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildImage() {
    if (widget.item.thumbnailPath.isEmpty) {
      return Container(
        color: AppTheme.surfaceLight,
        child: const Center(
          child: Icon(
            Icons.inventory_2_rounded,
            size: 48,
            color: AppTheme.textTertiary,
          ),
        ),
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        Image.file(
          File(widget.item.thumbnailPath),
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) {
            return Container(
              color: AppTheme.surfaceLight,
              child: const Center(
                child: Icon(
                  Icons.broken_image_rounded,
                  size: 48,
                  color: AppTheme.textTertiary,
                ),
              ),
            );
          },
        ),
        // Gradient overlay for better text readability
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            height: 60,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  Colors.black.withOpacity(0.3),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInfo() {
    // Extract label from detection data
    String labelText = 'Unknown';
    try {
      final detectionJson = jsonDecode(widget.item.detectionData) as Map<String, dynamic>;
      final detection = Detection.fromJson(detectionJson);
      labelText = detection.label;
    } catch (e) {
      // Fallback to Unknown if parsing fails
      labelText = 'Item';
    }

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            labelText,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
              height: 1.2,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const Spacer(),
          Row(
            children: [
              const Spacer(),
              Icon(
                Icons.arrow_forward_ios_rounded,
                size: 12,
                color: AppTheme.textTertiary,
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _navigateToDetail() {
    Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) =>
            ItemDetailScreen(itemId: widget.item.id),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          const begin = Offset(1.0, 0.0);
          const end = Offset.zero;
          const curve = Curves.easeOutCubic;
          var tween = Tween(begin: begin, end: end).chain(
            CurveTween(curve: curve),
          );
          return SlideTransition(
            position: animation.drive(tween),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 350),
      ),
    );
  }
}
