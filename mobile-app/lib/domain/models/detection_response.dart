import 'package:freezed_annotation/freezed_annotation.dart';
import 'detection.dart';
import 'provider_result.dart';
import 'ensemble_metrics.dart';

part 'detection_response.freezed.dart';
part 'detection_response.g.dart';

/// Response from the vision API detection endpoint
@freezed
class DetectionResponse with _$DetectionResponse {
  const factory DetectionResponse({
    /// Whether detection was successful
    required bool success,

    /// Ensemble mode used (full, partial, single, none)
    required String ensembleMode,

    /// Total processing time in milliseconds
    required int processingTimeMs,

    /// Final fused detections
    required List<Detection> detections,

    /// Individual provider results
    required List<ProviderResult> providerResults,

    /// Ensemble metrics
    required EnsembleMetrics ensembleMetrics,

    /// Error message if failed
    String? error,
  }) = _DetectionResponse;

  factory DetectionResponse.fromJson(Map<String, dynamic> json) =>
      _$DetectionResponseFromJson(json);
}
