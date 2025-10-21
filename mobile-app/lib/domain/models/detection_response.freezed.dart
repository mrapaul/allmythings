// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'detection_response.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

DetectionResponse _$DetectionResponseFromJson(Map<String, dynamic> json) {
  return _DetectionResponse.fromJson(json);
}

/// @nodoc
mixin _$DetectionResponse {
  /// Whether detection was successful
  bool get success => throw _privateConstructorUsedError;

  /// Ensemble mode used (full, partial, single, none)
  String get ensembleMode => throw _privateConstructorUsedError;

  /// Total processing time in milliseconds
  int get processingTimeMs => throw _privateConstructorUsedError;

  /// Final fused detections
  List<Detection> get detections => throw _privateConstructorUsedError;

  /// Individual provider results
  List<ProviderResult> get providerResults =>
      throw _privateConstructorUsedError;

  /// Ensemble metrics
  EnsembleMetrics get ensembleMetrics => throw _privateConstructorUsedError;

  /// Error message if failed
  String? get error => throw _privateConstructorUsedError;

  /// Serializes this DetectionResponse to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of DetectionResponse
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $DetectionResponseCopyWith<DetectionResponse> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $DetectionResponseCopyWith<$Res> {
  factory $DetectionResponseCopyWith(
          DetectionResponse value, $Res Function(DetectionResponse) then) =
      _$DetectionResponseCopyWithImpl<$Res, DetectionResponse>;
  @useResult
  $Res call(
      {bool success,
      String ensembleMode,
      int processingTimeMs,
      List<Detection> detections,
      List<ProviderResult> providerResults,
      EnsembleMetrics ensembleMetrics,
      String? error});

  $EnsembleMetricsCopyWith<$Res> get ensembleMetrics;
}

/// @nodoc
class _$DetectionResponseCopyWithImpl<$Res, $Val extends DetectionResponse>
    implements $DetectionResponseCopyWith<$Res> {
  _$DetectionResponseCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of DetectionResponse
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? ensembleMode = null,
    Object? processingTimeMs = null,
    Object? detections = null,
    Object? providerResults = null,
    Object? ensembleMetrics = null,
    Object? error = freezed,
  }) {
    return _then(_value.copyWith(
      success: null == success
          ? _value.success
          : success // ignore: cast_nullable_to_non_nullable
              as bool,
      ensembleMode: null == ensembleMode
          ? _value.ensembleMode
          : ensembleMode // ignore: cast_nullable_to_non_nullable
              as String,
      processingTimeMs: null == processingTimeMs
          ? _value.processingTimeMs
          : processingTimeMs // ignore: cast_nullable_to_non_nullable
              as int,
      detections: null == detections
          ? _value.detections
          : detections // ignore: cast_nullable_to_non_nullable
              as List<Detection>,
      providerResults: null == providerResults
          ? _value.providerResults
          : providerResults // ignore: cast_nullable_to_non_nullable
              as List<ProviderResult>,
      ensembleMetrics: null == ensembleMetrics
          ? _value.ensembleMetrics
          : ensembleMetrics // ignore: cast_nullable_to_non_nullable
              as EnsembleMetrics,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }

  /// Create a copy of DetectionResponse
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $EnsembleMetricsCopyWith<$Res> get ensembleMetrics {
    return $EnsembleMetricsCopyWith<$Res>(_value.ensembleMetrics, (value) {
      return _then(_value.copyWith(ensembleMetrics: value) as $Val);
    });
  }
}

/// @nodoc
abstract class _$$DetectionResponseImplCopyWith<$Res>
    implements $DetectionResponseCopyWith<$Res> {
  factory _$$DetectionResponseImplCopyWith(_$DetectionResponseImpl value,
          $Res Function(_$DetectionResponseImpl) then) =
      __$$DetectionResponseImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {bool success,
      String ensembleMode,
      int processingTimeMs,
      List<Detection> detections,
      List<ProviderResult> providerResults,
      EnsembleMetrics ensembleMetrics,
      String? error});

  @override
  $EnsembleMetricsCopyWith<$Res> get ensembleMetrics;
}

/// @nodoc
class __$$DetectionResponseImplCopyWithImpl<$Res>
    extends _$DetectionResponseCopyWithImpl<$Res, _$DetectionResponseImpl>
    implements _$$DetectionResponseImplCopyWith<$Res> {
  __$$DetectionResponseImplCopyWithImpl(_$DetectionResponseImpl _value,
      $Res Function(_$DetectionResponseImpl) _then)
      : super(_value, _then);

  /// Create a copy of DetectionResponse
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? success = null,
    Object? ensembleMode = null,
    Object? processingTimeMs = null,
    Object? detections = null,
    Object? providerResults = null,
    Object? ensembleMetrics = null,
    Object? error = freezed,
  }) {
    return _then(_$DetectionResponseImpl(
      success: null == success
          ? _value.success
          : success // ignore: cast_nullable_to_non_nullable
              as bool,
      ensembleMode: null == ensembleMode
          ? _value.ensembleMode
          : ensembleMode // ignore: cast_nullable_to_non_nullable
              as String,
      processingTimeMs: null == processingTimeMs
          ? _value.processingTimeMs
          : processingTimeMs // ignore: cast_nullable_to_non_nullable
              as int,
      detections: null == detections
          ? _value._detections
          : detections // ignore: cast_nullable_to_non_nullable
              as List<Detection>,
      providerResults: null == providerResults
          ? _value._providerResults
          : providerResults // ignore: cast_nullable_to_non_nullable
              as List<ProviderResult>,
      ensembleMetrics: null == ensembleMetrics
          ? _value.ensembleMetrics
          : ensembleMetrics // ignore: cast_nullable_to_non_nullable
              as EnsembleMetrics,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$DetectionResponseImpl implements _DetectionResponse {
  const _$DetectionResponseImpl(
      {required this.success,
      required this.ensembleMode,
      required this.processingTimeMs,
      required final List<Detection> detections,
      required final List<ProviderResult> providerResults,
      required this.ensembleMetrics,
      this.error})
      : _detections = detections,
        _providerResults = providerResults;

  factory _$DetectionResponseImpl.fromJson(Map<String, dynamic> json) =>
      _$$DetectionResponseImplFromJson(json);

  /// Whether detection was successful
  @override
  final bool success;

  /// Ensemble mode used (full, partial, single, none)
  @override
  final String ensembleMode;

  /// Total processing time in milliseconds
  @override
  final int processingTimeMs;

  /// Final fused detections
  final List<Detection> _detections;

  /// Final fused detections
  @override
  List<Detection> get detections {
    if (_detections is EqualUnmodifiableListView) return _detections;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_detections);
  }

  /// Individual provider results
  final List<ProviderResult> _providerResults;

  /// Individual provider results
  @override
  List<ProviderResult> get providerResults {
    if (_providerResults is EqualUnmodifiableListView) return _providerResults;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_providerResults);
  }

  /// Ensemble metrics
  @override
  final EnsembleMetrics ensembleMetrics;

  /// Error message if failed
  @override
  final String? error;

  @override
  String toString() {
    return 'DetectionResponse(success: $success, ensembleMode: $ensembleMode, processingTimeMs: $processingTimeMs, detections: $detections, providerResults: $providerResults, ensembleMetrics: $ensembleMetrics, error: $error)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$DetectionResponseImpl &&
            (identical(other.success, success) || other.success == success) &&
            (identical(other.ensembleMode, ensembleMode) ||
                other.ensembleMode == ensembleMode) &&
            (identical(other.processingTimeMs, processingTimeMs) ||
                other.processingTimeMs == processingTimeMs) &&
            const DeepCollectionEquality()
                .equals(other._detections, _detections) &&
            const DeepCollectionEquality()
                .equals(other._providerResults, _providerResults) &&
            (identical(other.ensembleMetrics, ensembleMetrics) ||
                other.ensembleMetrics == ensembleMetrics) &&
            (identical(other.error, error) || other.error == error));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      success,
      ensembleMode,
      processingTimeMs,
      const DeepCollectionEquality().hash(_detections),
      const DeepCollectionEquality().hash(_providerResults),
      ensembleMetrics,
      error);

  /// Create a copy of DetectionResponse
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$DetectionResponseImplCopyWith<_$DetectionResponseImpl> get copyWith =>
      __$$DetectionResponseImplCopyWithImpl<_$DetectionResponseImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$DetectionResponseImplToJson(
      this,
    );
  }
}

abstract class _DetectionResponse implements DetectionResponse {
  const factory _DetectionResponse(
      {required final bool success,
      required final String ensembleMode,
      required final int processingTimeMs,
      required final List<Detection> detections,
      required final List<ProviderResult> providerResults,
      required final EnsembleMetrics ensembleMetrics,
      final String? error}) = _$DetectionResponseImpl;

  factory _DetectionResponse.fromJson(Map<String, dynamic> json) =
      _$DetectionResponseImpl.fromJson;

  /// Whether detection was successful
  @override
  bool get success;

  /// Ensemble mode used (full, partial, single, none)
  @override
  String get ensembleMode;

  /// Total processing time in milliseconds
  @override
  int get processingTimeMs;

  /// Final fused detections
  @override
  List<Detection> get detections;

  /// Individual provider results
  @override
  List<ProviderResult> get providerResults;

  /// Ensemble metrics
  @override
  EnsembleMetrics get ensembleMetrics;

  /// Error message if failed
  @override
  String? get error;

  /// Create a copy of DetectionResponse
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$DetectionResponseImplCopyWith<_$DetectionResponseImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
