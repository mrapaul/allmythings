import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';

/// Modern animated loading indicator with multiple styles
class LoadingIndicator extends StatelessWidget {
  const LoadingIndicator({
    super.key,
    this.style = LoadingStyle.spinner,
    this.message,
    this.size = 48,
  });
  final LoadingStyle style;
  final String? message;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLoader(),
          if (message != null) ...[
            const SizedBox(height: 16),
            Text(
              message!,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLoader() {
    switch (style) {
      case LoadingStyle.spinner:
        return _SpinnerLoader(size: size);
      case LoadingStyle.dots:
        return _DotsLoader(size: size);
      case LoadingStyle.pulse:
        return _PulseLoader(size: size);
      case LoadingStyle.shimmer:
        return _ShimmerLoader(size: size);
    }
  }
}

enum LoadingStyle {
  spinner,
  dots,
  pulse,
  shimmer,
}

/// Circular spinner loader
class _SpinnerLoader extends StatelessWidget {
  const _SpinnerLoader({required this.size});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: const CircularProgressIndicator(
        strokeWidth: 3,
        valueColor: AlwaysStoppedAnimation<Color>(
          AppTheme.primaryBlack,
        ),
      ),
    );
  }
}

/// Three dots animated loader
class _DotsLoader extends StatefulWidget {
  const _DotsLoader({required this.size});
  final double size;

  @override
  State<_DotsLoader> createState() => _DotsLoaderState();
}

class _DotsLoaderState extends State<_DotsLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size * 2,
      height: widget.size / 3,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: List.generate(3, (index) {
          return AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              final delay = index * 0.2;
              final value = (_controller.value - delay).clamp(0.0, 1.0);
              final scale = (1.0 - (value * 2 - 1).abs()) * 0.5 + 0.5;

              return Transform.scale(
                scale: scale,
                child: Container(
                  width: widget.size / 6,
                  height: widget.size / 6,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryBlack.withOpacity(0.8 + scale * 0.2),
                    shape: BoxShape.circle,
                  ),
                ),
              );
            },
          );
        }),
      ),
    );
  }
}

/// Pulsing circle loader
class _PulseLoader extends StatefulWidget {
  const _PulseLoader({required this.size});
  final double size;

  @override
  State<_PulseLoader> createState() => _PulseLoaderState();
}

class _PulseLoaderState extends State<_PulseLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();

    _scaleAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );

    _opacityAnimation = Tween<double>(begin: 0.8, end: 0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Outer ring
          AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return Transform.scale(
                scale: _scaleAnimation.value,
                child: Opacity(
                  opacity: _opacityAnimation.value,
                  child: Container(
                    width: widget.size,
                    height: widget.size,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.primaryBlack,
                        width: 3,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          // Inner circle
          Container(
            width: widget.size / 4,
            height: widget.size / 4,
            decoration: const BoxDecoration(
              color: AppTheme.primaryBlack,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}

/// Shimmer effect loader
class _ShimmerLoader extends StatefulWidget {
  const _ShimmerLoader({required this.size});
  final double size;

  @override
  State<_ShimmerLoader> createState() => _ShimmerLoaderState();
}

class _ShimmerLoaderState extends State<_ShimmerLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size * 2,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              gradient: LinearGradient(
                begin: Alignment(-1.0 + _controller.value * 3, 0),
                end: Alignment(-0.5 + _controller.value * 3, 0),
                colors: const [
                  AppTheme.surfaceMedium,
                  AppTheme.surfaceLight,
                  AppTheme.surfaceMedium,
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Card shimmer effect for loading states
class ShimmerCard extends StatefulWidget {
  const ShimmerCard({
    super.key,
    this.height = 200,
    this.width,
    this.borderRadius,
  });
  final double height;
  final double? width;
  final BorderRadius? borderRadius;

  @override
  State<ShimmerCard> createState() => _ShimmerCardState();
}

class _ShimmerCardState extends State<ShimmerCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            borderRadius: widget.borderRadius ?? BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment(-1.0 + _controller.value * 3, 0),
              end: Alignment(-0.5 + _controller.value * 3, 0),
              colors: const [
                AppTheme.surfaceMedium,
                AppTheme.surfaceLight,
                AppTheme.surfaceMedium,
              ],
              stops: const [0.0, 0.5, 1.0],
            ),
          ),
        );
      },
    );
  }
}

/// List shimmer effect for loading feed
class ShimmerList extends StatelessWidget {
  const ShimmerList({
    super.key,
    this.itemCount = 5,
    this.itemHeight = 80,
    this.padding,
  });
  final int itemCount;
  final double itemHeight;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: padding ?? const EdgeInsets.all(16),
      itemCount: itemCount,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) => ShimmerCard(height: itemHeight),
    );
  }
}

/// Grid shimmer effect for loading grid
class ShimmerGrid extends StatelessWidget {
  const ShimmerGrid({
    super.key,
    this.itemCount = 9,
    this.crossAxisCount = 3,
    this.aspectRatio = 1.0,
    this.padding,
  });
  final int itemCount;
  final int crossAxisCount;
  final double aspectRatio;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: padding ?? const EdgeInsets.all(2),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: 2,
        mainAxisSpacing: 2,
        childAspectRatio: aspectRatio,
      ),
      itemCount: itemCount,
      itemBuilder: (context, index) => const ShimmerCard(
        height: double.infinity,
        borderRadius: BorderRadius.zero,
      ),
    );
  }
}
