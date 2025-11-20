import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';

/// Modern error display widget with animations and different styles
class ErrorView extends StatefulWidget {
  const ErrorView({
    required this.message,
    super.key,
    this.subtitle,
    this.onRetry,
    this.style = ErrorStyle.general,
    this.customIcon,
  });
  final String message;
  final String? subtitle;
  final VoidCallback? onRetry;
  final ErrorStyle style;
  final IconData? customIcon;

  @override
  State<ErrorView> createState() => _ErrorViewState();
}

class _ErrorViewState extends State<ErrorView>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );

    _slideAnimation =
        Tween<Offset>(
          begin: const Offset(0, 0.1),
          end: Offset.zero,
        ).animate(
          CurvedAnimation(
            parent: _controller,
            curve: Curves.easeOutCubic,
          ),
        );

    _scaleAnimation = Tween<double>(begin: 0.9, end: 1).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Curves.easeOutBack,
      ),
    );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: ScaleTransition(
          scale: _scaleAnimation,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildErrorIcon(),
                  const SizedBox(height: 24),
                  Text(
                    widget.message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (widget.subtitle != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      widget.subtitle!,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                  if (widget.onRetry != null) ...[
                    const SizedBox(height: 32),
                    _buildRetryButton(),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildErrorIcon() {
    IconData icon;
    Color color;
    Color backgroundColor;

    switch (widget.style) {
      case ErrorStyle.general:
        icon = widget.customIcon ?? Icons.error_outline_rounded;
        color = AppTheme.accentRed;
        backgroundColor = AppTheme.accentRed.withOpacity(0.1);
      case ErrorStyle.network:
        icon = widget.customIcon ?? Icons.wifi_off_rounded;
        color = AppTheme.accentOrange;
        backgroundColor = AppTheme.accentOrange.withOpacity(0.1);
      case ErrorStyle.empty:
        icon = widget.customIcon ?? Icons.inbox_rounded;
        color = AppTheme.textSecondary;
        backgroundColor = AppTheme.surfaceMedium;
      case ErrorStyle.notFound:
        icon = widget.customIcon ?? Icons.search_off_rounded;
        color = AppTheme.textSecondary;
        backgroundColor = AppTheme.surfaceMedium;
    }

    return Container(
      width: 120,
      height: 120,
      decoration: BoxDecoration(
        color: backgroundColor,
        shape: BoxShape.circle,
      ),
      child: Icon(
        icon,
        size: 56,
        color: color,
      ),
    );
  }

  Widget _buildRetryButton() {
    return ElevatedButton.icon(
      onPressed: () async {
        await _controller.reverse();
        widget.onRetry?.call();
        _controller.forward();
      },
      icon: const Icon(Icons.refresh_rounded, size: 20),
      label: const Text('Try Again'),
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }
}

enum ErrorStyle {
  general,
  network,
  empty,
  notFound,
}

/// Compact error banner for inline errors
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({
    required this.message,
    super.key,
    this.onRetry,
    this.onDismiss,
    this.backgroundColor,
    this.icon,
  });
  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onDismiss;
  final Color? backgroundColor;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: backgroundColor ?? AppTheme.accentRed.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: backgroundColor ?? AppTheme.accentRed.withOpacity(0.3),
        ),
      ),
      child: Row(
        children: [
          Icon(
            icon ?? Icons.error_outline_rounded,
            color: backgroundColor != null
                ? AppTheme.textPrimary
                : AppTheme.accentRed,
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: backgroundColor != null
                    ? AppTheme.textPrimary
                    : AppTheme.accentRed,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(width: 12),
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'Retry',
                style: TextStyle(
                  color: backgroundColor != null
                      ? AppTheme.textPrimary
                      : AppTheme.accentRed,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          if (onDismiss != null) ...[
            const SizedBox(width: 4),
            IconButton(
              onPressed: onDismiss,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              icon: Icon(
                Icons.close_rounded,
                size: 20,
                color: backgroundColor != null
                    ? AppTheme.textSecondary
                    : AppTheme.accentRed.withOpacity(0.7),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Empty state widget for when there's no data
class EmptyState extends StatefulWidget {
  const EmptyState({
    required this.title,
    required this.subtitle,
    required this.icon,
    super.key,
    this.action,
    this.iconColor,
  });
  final String title;
  final String subtitle;
  final IconData icon;
  final Widget? action;
  final Color? iconColor;

  @override
  State<EmptyState> createState() => _EmptyStateState();
}

class _EmptyStateState extends State<EmptyState>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );

    _slideAnimation =
        Tween<Offset>(
          begin: const Offset(0, 0.15),
          end: Offset.zero,
        ).animate(
          CurvedAnimation(
            parent: _controller,
            curve: Curves.easeOutCubic,
          ),
        );

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 140,
                  height: 140,
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceLight,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppTheme.borderLight,
                      width: 2,
                    ),
                  ),
                  child: Icon(
                    widget.icon,
                    size: 64,
                    color: widget.iconColor ?? AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 32),
                Text(
                  widget.title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  widget.subtitle,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if (widget.action != null) ...[
                  const SizedBox(height: 32),
                  widget.action!,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Connection error widget with reconnect action
class ConnectionError extends StatelessWidget {
  const ConnectionError({super.key, this.onRetry});
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return ErrorView(
      message: 'No Internet Connection',
      subtitle: 'Please check your connection and try again',
      style: ErrorStyle.network,
      onRetry: onRetry,
    );
  }
}

/// Not found error widget
class NotFoundError extends StatelessWidget {
  const NotFoundError({
    super.key,
    this.message = 'Item Not Found',
    this.onGoBack,
  });
  final String message;
  final VoidCallback? onGoBack;

  @override
  Widget build(BuildContext context) {
    return ErrorView(
      message: message,
      subtitle: "The item you're looking for doesn't exist",
      style: ErrorStyle.notFound,
      onRetry: onGoBack,
    );
  }
}
