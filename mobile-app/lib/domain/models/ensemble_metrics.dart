import 'package:freezed_annotation/freezed_annotation.dart';

part 'ensemble_metrics.freezed.dart';
part 'ensemble_metrics.g.dart';

/// Metrics about the ensemble detection process
@freezed
class EnsembleMetrics with _$EnsembleMetrics {
  const factory EnsembleMetrics({
    /// Number of providers used in ensemble
    required int providersUsed,

    /// Average confidence across all providers
    required double averageConfidence,

    /// Rate of consensus among providers (0-1)
    required double consensusRate,
  }) = _EnsembleMetrics;

  factory EnsembleMetrics.fromJson(Map<String, dynamic> json) =>
      _$EnsembleMetricsFromJson(json);
}
