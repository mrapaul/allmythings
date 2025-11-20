import 'package:freezed_annotation/freezed_annotation.dart';

part 'quality_metrics.freezed.dart';
part 'quality_metrics.g.dart';

/// Quality metrics for an analyzed image
/// Contains blur, brightness, contrast, and resolution data
@freezed
abstract class QualityMetrics with _$QualityMetrics {
  const factory QualityMetrics({
    required bool isBlurry,
    required double blurScore,
    required double brightness,
    required double contrast,
    required ImageResolution resolution,
    required String qualityLevel, // 'excellent', 'good', 'acceptable', 'poor'
    required List<String> feedback,
    required String recommendedAction, // 'process', 'retry_lighting', 'retry_focus', 'retry_both', 'reject'
  }) = _QualityMetrics;

  factory QualityMetrics.fromJson(Map<String, dynamic> json) =>
      _$QualityMetricsFromJson(json);
}

/// Image resolution information
@freezed
abstract class ImageResolution with _$ImageResolution {
  const factory ImageResolution({
    required int width,
    required int height,
    required double megapixels,
  }) = _ImageResolution;

  factory ImageResolution.fromJson(Map<String, dynamic> json) =>
      _$ImageResolutionFromJson(json);
}
