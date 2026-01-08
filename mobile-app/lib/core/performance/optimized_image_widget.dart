/// Optimized Image Widget
/// Memory-efficient image loading with caching and lazy loading
library;

import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Configuration for image optimization
class ImageConfig {
  const ImageConfig({
    this.cacheWidth,
    this.cacheHeight,
    this.maxDiskCacheWidth = 1000,
    this.maxDiskCacheHeight = 1000,
    this.memCacheWidth,
    this.memCacheHeight,
    this.quality = 85,
  });

  final int? cacheWidth;
  final int? cacheHeight;
  final int maxDiskCacheWidth;
  final int maxDiskCacheHeight;
  final int? memCacheWidth;
  final int? memCacheHeight;
  final int quality;

  /// Thumbnail configuration (400x400)
  static const ImageConfig thumbnail = ImageConfig(
    cacheWidth: 400,
    cacheHeight: 400,
    maxDiskCacheWidth: 400,
    maxDiskCacheHeight: 400,
    memCacheWidth: 400,
    memCacheHeight: 400,
  );

  /// Medium size configuration (800x800)
  static const ImageConfig medium = ImageConfig(
    cacheWidth: 800,
    cacheHeight: 800,
    maxDiskCacheWidth: 800,
    maxDiskCacheHeight: 800,
    memCacheWidth: 800,
    memCacheHeight: 800,
  );

  /// Full size configuration (1920x1080)
  static const ImageConfig fullSize = ImageConfig(
    cacheWidth: 1920,
    cacheHeight: 1080,
    maxDiskCacheWidth: 1920,
    maxDiskCacheHeight: 1080,
    memCacheWidth: 1920,
    memCacheHeight: 1080,
  );
}

/// Optimized image widget with memory management and caching
class OptimizedImageWidget extends StatelessWidget {
  const OptimizedImageWidget({
    required this.imagePath, super.key,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.config = ImageConfig.thumbnail,
    this.placeholder,
    this.errorWidget,
    this.fadeInDuration = const Duration(milliseconds: 200),
    this.enableMemoryCache = true,
  });

  final String imagePath;
  final double? width;
  final double? height;
  final BoxFit fit;
  final ImageConfig config;
  final Widget? placeholder;
  final Widget? errorWidget;
  final Duration fadeInDuration;
  final bool enableMemoryCache;

  @override
  Widget build(BuildContext context) {
    // Local file path
    if (imagePath.startsWith('/') || imagePath.startsWith('file://')) {
      return _buildLocalImage();
    }

    // Network URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return _buildNetworkImage();
    }

    // Asset path
    if (imagePath.startsWith('assets/')) {
      return _buildAssetImage();
    }

    // Invalid path
    return _buildErrorWidget();
  }

  /// Build local file image with memory optimization
  Widget _buildLocalImage() {
    final file = File(imagePath);

    return Image.file(
      file,
      width: width,
      height: height,
      fit: fit,
      // Critical: Reduces memory usage by decoding at target size
      cacheWidth: config.cacheWidth,
      cacheHeight: config.cacheHeight,
      // Improve performance with RepaintBoundary
      frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
        if (wasSynchronouslyLoaded) {
          return child;
        }
        return AnimatedOpacity(
          opacity: frame == null ? 0 : 1,
          duration: fadeInDuration,
          curve: Curves.easeIn,
          child: child,
        );
      },
      errorBuilder: (context, error, stackTrace) {
        return errorWidget ?? _buildErrorWidget();
      },
    );
  }

  /// Build network image with caching
  Widget _buildNetworkImage() {
    return CachedNetworkImage(
      imageUrl: imagePath,
      width: width,
      height: height,
      fit: fit,
      // Memory cache optimization
      memCacheWidth: config.memCacheWidth,
      memCacheHeight: config.memCacheHeight,
      // Disk cache optimization
      maxWidthDiskCache: config.maxDiskCacheWidth,
      maxHeightDiskCache: config.maxDiskCacheHeight,
      // Placeholder while loading
      placeholder: (context, url) =>
          placeholder ?? _buildPlaceholderWidget(),
      // Error widget
      errorWidget: (context, url, error) =>
          errorWidget ?? _buildErrorWidget(),
      // Fade in animation
      fadeInDuration: fadeInDuration,
      fadeOutDuration: const Duration(milliseconds: 100),
    );
  }

  /// Build asset image
  Widget _buildAssetImage() {
    return Image.asset(
      imagePath,
      width: width,
      height: height,
      fit: fit,
      cacheWidth: config.cacheWidth,
      cacheHeight: config.cacheHeight,
      errorBuilder: (context, error, stackTrace) {
        return errorWidget ?? _buildErrorWidget();
      },
    );
  }

  /// Default placeholder widget
  Widget _buildPlaceholderWidget() {
    return Container(
      width: width,
      height: height,
      color: Colors.grey[200],
      child: const Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            valueColor: AlwaysStoppedAnimation<Color>(Colors.grey),
          ),
        ),
      ),
    );
  }

  /// Default error widget
  Widget _buildErrorWidget() {
    return Container(
      width: width,
      height: height,
      color: Colors.grey[200],
      child: const Center(
        child: Icon(
          Icons.broken_image_rounded,
          size: 32,
          color: Colors.grey,
        ),
      ),
    );
  }
}

/// Lazy loading image builder for lists
class LazyImageBuilder extends StatefulWidget {
  const LazyImageBuilder({
    required this.imagePath, required this.builder, super.key,
    this.threshold = 200.0,
  });

  final String imagePath;
  final Widget Function(BuildContext context, String imagePath) builder;
  final double threshold;

  @override
  State<LazyImageBuilder> createState() => _LazyImageBuilderState();
}

class _LazyImageBuilderState extends State<LazyImageBuilder> {
  bool _shouldLoad = false;

  @override
  Widget build(BuildContext context) {
    return VisibilityDetector(
      key: Key(widget.imagePath),
      onVisibilityChanged: (info) {
        if (info.visibleFraction > 0 && !_shouldLoad) {
          setState(() {
            _shouldLoad = true;
          });
        }
      },
      child: _shouldLoad
          ? widget.builder(context, widget.imagePath)
          : const SizedBox.shrink(),
    );
  }
}

/// Simple visibility detector for lazy loading
class VisibilityDetector extends StatefulWidget {
  const VisibilityDetector({
    required this.child, required this.onVisibilityChanged, super.key,
  });

  final Widget child;
  final void Function(VisibilityInfo info) onVisibilityChanged;

  @override
  State<VisibilityDetector> createState() => _VisibilityDetectorState();
}

class _VisibilityDetectorState extends State<VisibilityDetector> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkVisibility();
    });
  }

  void _checkVisibility() {
    // Simplified visibility check
    // In production, use the visibility_detector package
    widget.onVisibilityChanged(
      const VisibilityInfo(visibleFraction: 1),
    );
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}

/// Visibility information
class VisibilityInfo {
  const VisibilityInfo({required this.visibleFraction});

  final double visibleFraction;
}

/// Preload images for better UX
class ImagePreloader {
  /// Preload a single image
  static Future<void> preloadImage(
    BuildContext context,
    String imagePath,
  ) async {
    if (imagePath.startsWith('/')) {
      final image = FileImage(File(imagePath));
      await precacheImage(image, context);
    } else if (imagePath.startsWith('http')) {
      final image = NetworkImage(imagePath);
      await precacheImage(image, context);
    }
  }

  /// Preload multiple images
  static Future<void> preloadImages(
    BuildContext context,
    List<String> imagePaths,
  ) async {
    final futures = imagePaths.map((path) => preloadImage(context, path));
    await Future.wait(futures);
  }
}
