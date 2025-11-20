// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quality_metrics.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_QualityMetrics _$QualityMetricsFromJson(Map<String, dynamic> json) =>
    _QualityMetrics(
      isBlurry: json['isBlurry'] as bool,
      blurScore: (json['blurScore'] as num).toDouble(),
      brightness: (json['brightness'] as num).toDouble(),
      contrast: (json['contrast'] as num).toDouble(),
      resolution: ImageResolution.fromJson(
        json['resolution'] as Map<String, dynamic>,
      ),
      qualityLevel: json['qualityLevel'] as String,
      feedback: (json['feedback'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      recommendedAction: json['recommendedAction'] as String,
    );

Map<String, dynamic> _$QualityMetricsToJson(_QualityMetrics instance) =>
    <String, dynamic>{
      'isBlurry': instance.isBlurry,
      'blurScore': instance.blurScore,
      'brightness': instance.brightness,
      'contrast': instance.contrast,
      'resolution': instance.resolution,
      'qualityLevel': instance.qualityLevel,
      'feedback': instance.feedback,
      'recommendedAction': instance.recommendedAction,
    };

_ImageResolution _$ImageResolutionFromJson(Map<String, dynamic> json) =>
    _ImageResolution(
      width: (json['width'] as num).toInt(),
      height: (json['height'] as num).toInt(),
      megapixels: (json['megapixels'] as num).toDouble(),
    );

Map<String, dynamic> _$ImageResolutionToJson(_ImageResolution instance) =>
    <String, dynamic>{
      'width': instance.width,
      'height': instance.height,
      'megapixels': instance.megapixels,
    };
