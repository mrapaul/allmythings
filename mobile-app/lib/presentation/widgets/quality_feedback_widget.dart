import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:all_my_things/domain/models/quality_metrics.dart';

/// Widget that displays image quality feedback to the user
/// Shows blur, brightness, contrast, and resolution metrics
/// Provides actionable recommendations for improvement
class QualityFeedbackWidget extends ConsumerWidget {

  const QualityFeedbackWidget({
    required this.qualityMetrics,
    this.onRetry,
    this.isLoading = false,
    Key? key,
  }) : super(key: key);
  final QualityMetrics? qualityMetrics;
  final VoidCallback? onRetry;
  final bool isLoading;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (qualityMetrics == null) {
      return const SizedBox.shrink();
    }

    final metrics = qualityMetrics!;
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _getBackgroundColor(metrics.qualityLevel, isDarkMode),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _getBorderColor(metrics.qualityLevel),
          width: 2,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with quality level and icon
          Row(
            children: [
              _QualityIcon(qualityLevel: metrics.qualityLevel),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Image Quality: ${metrics.qualityLevel.toUpperCase()}',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: _getTextColor(metrics.qualityLevel),
                      ),
                    ),
                    if (metrics.qualityLevel != 'excellent')
                      Text(
                        metrics.recommendedAction.replaceAll('_', ' '),
                        style: TextStyle(
                          fontSize: 12,
                          color: _getTextColor(metrics.qualityLevel)
                              .withOpacity(0.7),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Metrics grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.8,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            children: [
              _MetricTile(
                label: 'Blur',
                value: '${(metrics.blurScore * 100).toStringAsFixed(0)}%',
                status: metrics.isBlurry ? 'Poor' : 'Good',
                isGood: !metrics.isBlurry,
              ),
              _MetricTile(
                label: 'Brightness',
                value: '${(metrics.brightness * 100).toStringAsFixed(0)}%',
                status: _getBrightnessStatus(metrics.brightness),
                isGood: metrics.brightness > 0.25 && metrics.brightness < 0.90,
              ),
              _MetricTile(
                label: 'Contrast',
                value: '${(metrics.contrast * 100).toStringAsFixed(0)}%',
                status: metrics.contrast > 0.2 ? 'Good' : 'Low',
                isGood: metrics.contrast > 0.2,
              ),
              _MetricTile(
                label: 'Resolution',
                value: '${metrics.resolution.megapixels.toStringAsFixed(1)}MP',
                status: metrics.resolution.megapixels > 1.0 ? 'OK' : 'Low',
                isGood: metrics.resolution.megapixels > 1.0,
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Feedback messages
          if (metrics.feedback.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: (isDarkMode ? Colors.white : Colors.black)
                    .withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Feedback:',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...metrics.feedback.map(
                    (feedback) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '• ',
                            style: TextStyle(
                              fontSize: 14,
                              color: _getTextColor(metrics.qualityLevel),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              feedback,
                              style: TextStyle(
                                fontSize: 12,
                                color: _getTextColor(metrics.qualityLevel),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 16),

          // Action buttons
          if (metrics.qualityLevel == 'poor' && onRetry != null)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: isLoading ? null : onRetry,
                icon: isLoading
                    ? SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(
                            Theme.of(context).primaryColor,
                          ),
                        ),
                      )
                    : const Icon(Icons.camera_alt),
                label: Text(
                  isLoading ? 'Processing...' : 'Retry with Better Lighting',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orange,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            )
          else if (metrics.qualityLevel != 'excellent' && onRetry != null)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: isLoading ? null : onRetry,
                icon: const Icon(Icons.camera_alt),
                label: const Text('Retake Photo'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color _getBackgroundColor(String level, bool isDarkMode) {
    final baseColor = {
          'excellent': Colors.green,
          'good': Colors.blue,
          'acceptable': Colors.orange,
          'poor': Colors.red,
        }[level] ??
        Colors.grey;
    return baseColor.withOpacity(isDarkMode ? 0.15 : 0.1);
  }

  Color _getBorderColor(String level) {
    return {
          'excellent': Colors.green,
          'good': Colors.blue,
          'acceptable': Colors.orange,
          'poor': Colors.red,
        }[level] ??
        Colors.grey;
  }

  Color _getTextColor(String level) {
    return {
          'excellent': Colors.green.shade700,
          'good': Colors.blue.shade700,
          'acceptable': Colors.orange.shade700,
          'poor': Colors.red.shade700,
        }[level] ??
        Colors.grey.shade700;
  }

  String _getBrightnessStatus(double brightness) {
    if (brightness < 0.25) return 'Too Dark';
    if (brightness > 0.90) return 'Too Bright';
    if (brightness < 0.35 || brightness > 0.80) return 'Fair';
    return 'Good';
  }
}

/// Icon display for quality level
class _QualityIcon extends StatelessWidget {

  const _QualityIcon({required this.qualityLevel});
  final String qualityLevel;

  @override
  Widget build(BuildContext context) {
    final iconData = {
      'excellent': Icons.check_circle,
      'good': Icons.check_circle_outline,
      'acceptable': Icons.warning_amber,
      'poor': Icons.error,
    }[qualityLevel];

    final color = {
      'excellent': Colors.green,
      'good': Colors.blue,
      'acceptable': Colors.orange,
      'poor': Colors.red,
    }[qualityLevel];

    return Icon(
      iconData,
      size: 32,
      color: color,
    );
  }
}

/// Individual metric display tile
class _MetricTile extends StatelessWidget {

  const _MetricTile({
    required this.label,
    required this.value,
    required this.status,
    required this.isGood,
  });
  final String label;
  final String value;
  final String status;
  final bool isGood;

  @override
  Widget build(BuildContext context) {
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: (isDarkMode ? Colors.white : Colors.black).withOpacity(0.03),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isGood ? Colors.green.withOpacity(0.3) : Colors.orange.withOpacity(0.3),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: (isDarkMode ? Colors.white : Colors.black).withOpacity(0.6),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            status,
            style: TextStyle(
              fontSize: 10,
              color: isGood ? Colors.green : Colors.orange,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
