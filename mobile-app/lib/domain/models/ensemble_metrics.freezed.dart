// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ensemble_metrics.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

EnsembleMetrics _$EnsembleMetricsFromJson(Map<String, dynamic> json) {
  return _EnsembleMetrics.fromJson(json);
}

/// @nodoc
mixin _$EnsembleMetrics {
  /// Number of providers used in ensemble
  int get providersUsed => throw _privateConstructorUsedError;

  /// Average confidence across all providers
  double get averageConfidence => throw _privateConstructorUsedError;

  /// Rate of consensus among providers (0-1)
  double get consensusRate => throw _privateConstructorUsedError;

  /// Serializes this EnsembleMetrics to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of EnsembleMetrics
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $EnsembleMetricsCopyWith<EnsembleMetrics> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $EnsembleMetricsCopyWith<$Res> {
  factory $EnsembleMetricsCopyWith(
          EnsembleMetrics value, $Res Function(EnsembleMetrics) then) =
      _$EnsembleMetricsCopyWithImpl<$Res, EnsembleMetrics>;
  @useResult
  $Res call(
      {int providersUsed, double averageConfidence, double consensusRate});
}

/// @nodoc
class _$EnsembleMetricsCopyWithImpl<$Res, $Val extends EnsembleMetrics>
    implements $EnsembleMetricsCopyWith<$Res> {
  _$EnsembleMetricsCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of EnsembleMetrics
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? providersUsed = null,
    Object? averageConfidence = null,
    Object? consensusRate = null,
  }) {
    return _then(_value.copyWith(
      providersUsed: null == providersUsed
          ? _value.providersUsed
          : providersUsed // ignore: cast_nullable_to_non_nullable
              as int,
      averageConfidence: null == averageConfidence
          ? _value.averageConfidence
          : averageConfidence // ignore: cast_nullable_to_non_nullable
              as double,
      consensusRate: null == consensusRate
          ? _value.consensusRate
          : consensusRate // ignore: cast_nullable_to_non_nullable
              as double,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$EnsembleMetricsImplCopyWith<$Res>
    implements $EnsembleMetricsCopyWith<$Res> {
  factory _$$EnsembleMetricsImplCopyWith(_$EnsembleMetricsImpl value,
          $Res Function(_$EnsembleMetricsImpl) then) =
      __$$EnsembleMetricsImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {int providersUsed, double averageConfidence, double consensusRate});
}

/// @nodoc
class __$$EnsembleMetricsImplCopyWithImpl<$Res>
    extends _$EnsembleMetricsCopyWithImpl<$Res, _$EnsembleMetricsImpl>
    implements _$$EnsembleMetricsImplCopyWith<$Res> {
  __$$EnsembleMetricsImplCopyWithImpl(
      _$EnsembleMetricsImpl _value, $Res Function(_$EnsembleMetricsImpl) _then)
      : super(_value, _then);

  /// Create a copy of EnsembleMetrics
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? providersUsed = null,
    Object? averageConfidence = null,
    Object? consensusRate = null,
  }) {
    return _then(_$EnsembleMetricsImpl(
      providersUsed: null == providersUsed
          ? _value.providersUsed
          : providersUsed // ignore: cast_nullable_to_non_nullable
              as int,
      averageConfidence: null == averageConfidence
          ? _value.averageConfidence
          : averageConfidence // ignore: cast_nullable_to_non_nullable
              as double,
      consensusRate: null == consensusRate
          ? _value.consensusRate
          : consensusRate // ignore: cast_nullable_to_non_nullable
              as double,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$EnsembleMetricsImpl implements _EnsembleMetrics {
  const _$EnsembleMetricsImpl(
      {required this.providersUsed,
      required this.averageConfidence,
      required this.consensusRate});

  factory _$EnsembleMetricsImpl.fromJson(Map<String, dynamic> json) =>
      _$$EnsembleMetricsImplFromJson(json);

  /// Number of providers used in ensemble
  @override
  final int providersUsed;

  /// Average confidence across all providers
  @override
  final double averageConfidence;

  /// Rate of consensus among providers (0-1)
  @override
  final double consensusRate;

  @override
  String toString() {
    return 'EnsembleMetrics(providersUsed: $providersUsed, averageConfidence: $averageConfidence, consensusRate: $consensusRate)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$EnsembleMetricsImpl &&
            (identical(other.providersUsed, providersUsed) ||
                other.providersUsed == providersUsed) &&
            (identical(other.averageConfidence, averageConfidence) ||
                other.averageConfidence == averageConfidence) &&
            (identical(other.consensusRate, consensusRate) ||
                other.consensusRate == consensusRate));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode =>
      Object.hash(runtimeType, providersUsed, averageConfidence, consensusRate);

  /// Create a copy of EnsembleMetrics
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$EnsembleMetricsImplCopyWith<_$EnsembleMetricsImpl> get copyWith =>
      __$$EnsembleMetricsImplCopyWithImpl<_$EnsembleMetricsImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$EnsembleMetricsImplToJson(
      this,
    );
  }
}

abstract class _EnsembleMetrics implements EnsembleMetrics {
  const factory _EnsembleMetrics(
      {required final int providersUsed,
      required final double averageConfidence,
      required final double consensusRate}) = _$EnsembleMetricsImpl;

  factory _EnsembleMetrics.fromJson(Map<String, dynamic> json) =
      _$EnsembleMetricsImpl.fromJson;

  /// Number of providers used in ensemble
  @override
  int get providersUsed;

  /// Average confidence across all providers
  @override
  double get averageConfidence;

  /// Rate of consensus among providers (0-1)
  @override
  double get consensusRate;

  /// Create a copy of EnsembleMetrics
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$EnsembleMetricsImplCopyWith<_$EnsembleMetricsImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
