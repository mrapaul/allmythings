import 'package:freezed_annotation/freezed_annotation.dart';
import 'vision_provider.dart';
import 'detection.dart';

part 'provider_result.freezed.dart';
part 'provider_result.g.dart';

/// Result from a single vision provider
@freezed
class ProviderResult with _$ProviderResult {
  const factory ProviderResult({
    /// Which provider returned this result
    required VisionProvider provider,

    /// Whether the provider succeeded
    required bool success,

    /// Processing time in milliseconds
    required int processingTimeMs,

    /// Detections from this provider (empty if failed)
    required List<Detection> detections,

    /// Error message if failed
    String? error,
  }) = _ProviderResult;

  factory ProviderResult.fromJson(Map<String, dynamic> json) =>
      _$ProviderResultFromJson(json);
}
