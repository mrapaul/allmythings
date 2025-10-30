// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ensemble_metrics.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$EnsembleMetrics {

/// Number of providers used in ensemble
 int get providersUsed;/// Average confidence across all providers
 double get averageConfidence;/// Rate of consensus among providers (0-1)
 double get consensusRate;
/// Create a copy of EnsembleMetrics
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$EnsembleMetricsCopyWith<EnsembleMetrics> get copyWith => _$EnsembleMetricsCopyWithImpl<EnsembleMetrics>(this as EnsembleMetrics, _$identity);

  /// Serializes this EnsembleMetrics to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is EnsembleMetrics&&(identical(other.providersUsed, providersUsed) || other.providersUsed == providersUsed)&&(identical(other.averageConfidence, averageConfidence) || other.averageConfidence == averageConfidence)&&(identical(other.consensusRate, consensusRate) || other.consensusRate == consensusRate));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,providersUsed,averageConfidence,consensusRate);

@override
String toString() {
  return 'EnsembleMetrics(providersUsed: $providersUsed, averageConfidence: $averageConfidence, consensusRate: $consensusRate)';
}


}

/// @nodoc
abstract mixin class $EnsembleMetricsCopyWith<$Res>  {
  factory $EnsembleMetricsCopyWith(EnsembleMetrics value, $Res Function(EnsembleMetrics) _then) = _$EnsembleMetricsCopyWithImpl;
@useResult
$Res call({
 int providersUsed, double averageConfidence, double consensusRate
});




}
/// @nodoc
class _$EnsembleMetricsCopyWithImpl<$Res>
    implements $EnsembleMetricsCopyWith<$Res> {
  _$EnsembleMetricsCopyWithImpl(this._self, this._then);

  final EnsembleMetrics _self;
  final $Res Function(EnsembleMetrics) _then;

/// Create a copy of EnsembleMetrics
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? providersUsed = null,Object? averageConfidence = null,Object? consensusRate = null,}) {
  return _then(_self.copyWith(
providersUsed: null == providersUsed ? _self.providersUsed : providersUsed // ignore: cast_nullable_to_non_nullable
as int,averageConfidence: null == averageConfidence ? _self.averageConfidence : averageConfidence // ignore: cast_nullable_to_non_nullable
as double,consensusRate: null == consensusRate ? _self.consensusRate : consensusRate // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [EnsembleMetrics].
extension EnsembleMetricsPatterns on EnsembleMetrics {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _EnsembleMetrics value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _EnsembleMetrics() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _EnsembleMetrics value)  $default,){
final _that = this;
switch (_that) {
case _EnsembleMetrics():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _EnsembleMetrics value)?  $default,){
final _that = this;
switch (_that) {
case _EnsembleMetrics() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int providersUsed,  double averageConfidence,  double consensusRate)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _EnsembleMetrics() when $default != null:
return $default(_that.providersUsed,_that.averageConfidence,_that.consensusRate);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int providersUsed,  double averageConfidence,  double consensusRate)  $default,) {final _that = this;
switch (_that) {
case _EnsembleMetrics():
return $default(_that.providersUsed,_that.averageConfidence,_that.consensusRate);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int providersUsed,  double averageConfidence,  double consensusRate)?  $default,) {final _that = this;
switch (_that) {
case _EnsembleMetrics() when $default != null:
return $default(_that.providersUsed,_that.averageConfidence,_that.consensusRate);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _EnsembleMetrics implements EnsembleMetrics {
  const _EnsembleMetrics({required this.providersUsed, required this.averageConfidence, required this.consensusRate});
  factory _EnsembleMetrics.fromJson(Map<String, dynamic> json) => _$EnsembleMetricsFromJson(json);

/// Number of providers used in ensemble
@override final  int providersUsed;
/// Average confidence across all providers
@override final  double averageConfidence;
/// Rate of consensus among providers (0-1)
@override final  double consensusRate;

/// Create a copy of EnsembleMetrics
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$EnsembleMetricsCopyWith<_EnsembleMetrics> get copyWith => __$EnsembleMetricsCopyWithImpl<_EnsembleMetrics>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$EnsembleMetricsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _EnsembleMetrics&&(identical(other.providersUsed, providersUsed) || other.providersUsed == providersUsed)&&(identical(other.averageConfidence, averageConfidence) || other.averageConfidence == averageConfidence)&&(identical(other.consensusRate, consensusRate) || other.consensusRate == consensusRate));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,providersUsed,averageConfidence,consensusRate);

@override
String toString() {
  return 'EnsembleMetrics(providersUsed: $providersUsed, averageConfidence: $averageConfidence, consensusRate: $consensusRate)';
}


}

/// @nodoc
abstract mixin class _$EnsembleMetricsCopyWith<$Res> implements $EnsembleMetricsCopyWith<$Res> {
  factory _$EnsembleMetricsCopyWith(_EnsembleMetrics value, $Res Function(_EnsembleMetrics) _then) = __$EnsembleMetricsCopyWithImpl;
@override @useResult
$Res call({
 int providersUsed, double averageConfidence, double consensusRate
});




}
/// @nodoc
class __$EnsembleMetricsCopyWithImpl<$Res>
    implements _$EnsembleMetricsCopyWith<$Res> {
  __$EnsembleMetricsCopyWithImpl(this._self, this._then);

  final _EnsembleMetrics _self;
  final $Res Function(_EnsembleMetrics) _then;

/// Create a copy of EnsembleMetrics
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? providersUsed = null,Object? averageConfidence = null,Object? consensusRate = null,}) {
  return _then(_EnsembleMetrics(
providersUsed: null == providersUsed ? _self.providersUsed : providersUsed // ignore: cast_nullable_to_non_nullable
as int,averageConfidence: null == averageConfidence ? _self.averageConfidence : averageConfidence // ignore: cast_nullable_to_non_nullable
as double,consensusRate: null == consensusRate ? _self.consensusRate : consensusRate // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}

// dart format on
