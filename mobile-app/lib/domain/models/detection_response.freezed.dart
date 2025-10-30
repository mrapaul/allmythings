// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'detection_response.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DetectionResponse {

/// Whether detection was successful
 bool get success;/// Ensemble mode used (full, partial, single, none)
 String get ensembleMode;/// Total processing time in milliseconds
 int get processingTimeMs;/// Final fused detections
 List<Detection> get detections;/// Individual provider results
 List<ProviderResult> get providerResults;/// Ensemble metrics
 EnsembleMetrics get ensembleMetrics;/// Error message if failed
 String? get error;
/// Create a copy of DetectionResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DetectionResponseCopyWith<DetectionResponse> get copyWith => _$DetectionResponseCopyWithImpl<DetectionResponse>(this as DetectionResponse, _$identity);

  /// Serializes this DetectionResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionResponse&&(identical(other.success, success) || other.success == success)&&(identical(other.ensembleMode, ensembleMode) || other.ensembleMode == ensembleMode)&&(identical(other.processingTimeMs, processingTimeMs) || other.processingTimeMs == processingTimeMs)&&const DeepCollectionEquality().equals(other.detections, detections)&&const DeepCollectionEquality().equals(other.providerResults, providerResults)&&(identical(other.ensembleMetrics, ensembleMetrics) || other.ensembleMetrics == ensembleMetrics)&&(identical(other.error, error) || other.error == error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,success,ensembleMode,processingTimeMs,const DeepCollectionEquality().hash(detections),const DeepCollectionEquality().hash(providerResults),ensembleMetrics,error);

@override
String toString() {
  return 'DetectionResponse(success: $success, ensembleMode: $ensembleMode, processingTimeMs: $processingTimeMs, detections: $detections, providerResults: $providerResults, ensembleMetrics: $ensembleMetrics, error: $error)';
}


}

/// @nodoc
abstract mixin class $DetectionResponseCopyWith<$Res>  {
  factory $DetectionResponseCopyWith(DetectionResponse value, $Res Function(DetectionResponse) _then) = _$DetectionResponseCopyWithImpl;
@useResult
$Res call({
 bool success, String ensembleMode, int processingTimeMs, List<Detection> detections, List<ProviderResult> providerResults, EnsembleMetrics ensembleMetrics, String? error
});


$EnsembleMetricsCopyWith<$Res> get ensembleMetrics;

}
/// @nodoc
class _$DetectionResponseCopyWithImpl<$Res>
    implements $DetectionResponseCopyWith<$Res> {
  _$DetectionResponseCopyWithImpl(this._self, this._then);

  final DetectionResponse _self;
  final $Res Function(DetectionResponse) _then;

/// Create a copy of DetectionResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? success = null,Object? ensembleMode = null,Object? processingTimeMs = null,Object? detections = null,Object? providerResults = null,Object? ensembleMetrics = null,Object? error = freezed,}) {
  return _then(_self.copyWith(
success: null == success ? _self.success : success // ignore: cast_nullable_to_non_nullable
as bool,ensembleMode: null == ensembleMode ? _self.ensembleMode : ensembleMode // ignore: cast_nullable_to_non_nullable
as String,processingTimeMs: null == processingTimeMs ? _self.processingTimeMs : processingTimeMs // ignore: cast_nullable_to_non_nullable
as int,detections: null == detections ? _self.detections : detections // ignore: cast_nullable_to_non_nullable
as List<Detection>,providerResults: null == providerResults ? _self.providerResults : providerResults // ignore: cast_nullable_to_non_nullable
as List<ProviderResult>,ensembleMetrics: null == ensembleMetrics ? _self.ensembleMetrics : ensembleMetrics // ignore: cast_nullable_to_non_nullable
as EnsembleMetrics,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}
/// Create a copy of DetectionResponse
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EnsembleMetricsCopyWith<$Res> get ensembleMetrics {
  
  return $EnsembleMetricsCopyWith<$Res>(_self.ensembleMetrics, (value) {
    return _then(_self.copyWith(ensembleMetrics: value));
  });
}
}


/// Adds pattern-matching-related methods to [DetectionResponse].
extension DetectionResponsePatterns on DetectionResponse {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DetectionResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DetectionResponse() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DetectionResponse value)  $default,){
final _that = this;
switch (_that) {
case _DetectionResponse():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DetectionResponse value)?  $default,){
final _that = this;
switch (_that) {
case _DetectionResponse() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool success,  String ensembleMode,  int processingTimeMs,  List<Detection> detections,  List<ProviderResult> providerResults,  EnsembleMetrics ensembleMetrics,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DetectionResponse() when $default != null:
return $default(_that.success,_that.ensembleMode,_that.processingTimeMs,_that.detections,_that.providerResults,_that.ensembleMetrics,_that.error);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool success,  String ensembleMode,  int processingTimeMs,  List<Detection> detections,  List<ProviderResult> providerResults,  EnsembleMetrics ensembleMetrics,  String? error)  $default,) {final _that = this;
switch (_that) {
case _DetectionResponse():
return $default(_that.success,_that.ensembleMode,_that.processingTimeMs,_that.detections,_that.providerResults,_that.ensembleMetrics,_that.error);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool success,  String ensembleMode,  int processingTimeMs,  List<Detection> detections,  List<ProviderResult> providerResults,  EnsembleMetrics ensembleMetrics,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _DetectionResponse() when $default != null:
return $default(_that.success,_that.ensembleMode,_that.processingTimeMs,_that.detections,_that.providerResults,_that.ensembleMetrics,_that.error);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DetectionResponse implements DetectionResponse {
  const _DetectionResponse({required this.success, required this.ensembleMode, required this.processingTimeMs, required final  List<Detection> detections, required final  List<ProviderResult> providerResults, required this.ensembleMetrics, this.error}): _detections = detections,_providerResults = providerResults;
  factory _DetectionResponse.fromJson(Map<String, dynamic> json) => _$DetectionResponseFromJson(json);

/// Whether detection was successful
@override final  bool success;
/// Ensemble mode used (full, partial, single, none)
@override final  String ensembleMode;
/// Total processing time in milliseconds
@override final  int processingTimeMs;
/// Final fused detections
 final  List<Detection> _detections;
/// Final fused detections
@override List<Detection> get detections {
  if (_detections is EqualUnmodifiableListView) return _detections;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_detections);
}

/// Individual provider results
 final  List<ProviderResult> _providerResults;
/// Individual provider results
@override List<ProviderResult> get providerResults {
  if (_providerResults is EqualUnmodifiableListView) return _providerResults;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_providerResults);
}

/// Ensemble metrics
@override final  EnsembleMetrics ensembleMetrics;
/// Error message if failed
@override final  String? error;

/// Create a copy of DetectionResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DetectionResponseCopyWith<_DetectionResponse> get copyWith => __$DetectionResponseCopyWithImpl<_DetectionResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DetectionResponseToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DetectionResponse&&(identical(other.success, success) || other.success == success)&&(identical(other.ensembleMode, ensembleMode) || other.ensembleMode == ensembleMode)&&(identical(other.processingTimeMs, processingTimeMs) || other.processingTimeMs == processingTimeMs)&&const DeepCollectionEquality().equals(other._detections, _detections)&&const DeepCollectionEquality().equals(other._providerResults, _providerResults)&&(identical(other.ensembleMetrics, ensembleMetrics) || other.ensembleMetrics == ensembleMetrics)&&(identical(other.error, error) || other.error == error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,success,ensembleMode,processingTimeMs,const DeepCollectionEquality().hash(_detections),const DeepCollectionEquality().hash(_providerResults),ensembleMetrics,error);

@override
String toString() {
  return 'DetectionResponse(success: $success, ensembleMode: $ensembleMode, processingTimeMs: $processingTimeMs, detections: $detections, providerResults: $providerResults, ensembleMetrics: $ensembleMetrics, error: $error)';
}


}

/// @nodoc
abstract mixin class _$DetectionResponseCopyWith<$Res> implements $DetectionResponseCopyWith<$Res> {
  factory _$DetectionResponseCopyWith(_DetectionResponse value, $Res Function(_DetectionResponse) _then) = __$DetectionResponseCopyWithImpl;
@override @useResult
$Res call({
 bool success, String ensembleMode, int processingTimeMs, List<Detection> detections, List<ProviderResult> providerResults, EnsembleMetrics ensembleMetrics, String? error
});


@override $EnsembleMetricsCopyWith<$Res> get ensembleMetrics;

}
/// @nodoc
class __$DetectionResponseCopyWithImpl<$Res>
    implements _$DetectionResponseCopyWith<$Res> {
  __$DetectionResponseCopyWithImpl(this._self, this._then);

  final _DetectionResponse _self;
  final $Res Function(_DetectionResponse) _then;

/// Create a copy of DetectionResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? success = null,Object? ensembleMode = null,Object? processingTimeMs = null,Object? detections = null,Object? providerResults = null,Object? ensembleMetrics = null,Object? error = freezed,}) {
  return _then(_DetectionResponse(
success: null == success ? _self.success : success // ignore: cast_nullable_to_non_nullable
as bool,ensembleMode: null == ensembleMode ? _self.ensembleMode : ensembleMode // ignore: cast_nullable_to_non_nullable
as String,processingTimeMs: null == processingTimeMs ? _self.processingTimeMs : processingTimeMs // ignore: cast_nullable_to_non_nullable
as int,detections: null == detections ? _self._detections : detections // ignore: cast_nullable_to_non_nullable
as List<Detection>,providerResults: null == providerResults ? _self._providerResults : providerResults // ignore: cast_nullable_to_non_nullable
as List<ProviderResult>,ensembleMetrics: null == ensembleMetrics ? _self.ensembleMetrics : ensembleMetrics // ignore: cast_nullable_to_non_nullable
as EnsembleMetrics,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

/// Create a copy of DetectionResponse
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EnsembleMetricsCopyWith<$Res> get ensembleMetrics {
  
  return $EnsembleMetricsCopyWith<$Res>(_self.ensembleMetrics, (value) {
    return _then(_self.copyWith(ensembleMetrics: value));
  });
}
}

// dart format on
