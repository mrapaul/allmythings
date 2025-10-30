// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'provider_result.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$ProviderResult {

/// Which provider returned this result
 VisionProvider get provider;/// Whether the provider succeeded
 bool get success;/// Processing time in milliseconds
 int get processingTimeMs;/// Detections from this provider (empty if failed)
 List<Detection> get detections;/// Error message if failed
 String? get error;
/// Create a copy of ProviderResult
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ProviderResultCopyWith<ProviderResult> get copyWith => _$ProviderResultCopyWithImpl<ProviderResult>(this as ProviderResult, _$identity);

  /// Serializes this ProviderResult to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ProviderResult&&(identical(other.provider, provider) || other.provider == provider)&&(identical(other.success, success) || other.success == success)&&(identical(other.processingTimeMs, processingTimeMs) || other.processingTimeMs == processingTimeMs)&&const DeepCollectionEquality().equals(other.detections, detections)&&(identical(other.error, error) || other.error == error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,provider,success,processingTimeMs,const DeepCollectionEquality().hash(detections),error);

@override
String toString() {
  return 'ProviderResult(provider: $provider, success: $success, processingTimeMs: $processingTimeMs, detections: $detections, error: $error)';
}


}

/// @nodoc
abstract mixin class $ProviderResultCopyWith<$Res>  {
  factory $ProviderResultCopyWith(ProviderResult value, $Res Function(ProviderResult) _then) = _$ProviderResultCopyWithImpl;
@useResult
$Res call({
 VisionProvider provider, bool success, int processingTimeMs, List<Detection> detections, String? error
});




}
/// @nodoc
class _$ProviderResultCopyWithImpl<$Res>
    implements $ProviderResultCopyWith<$Res> {
  _$ProviderResultCopyWithImpl(this._self, this._then);

  final ProviderResult _self;
  final $Res Function(ProviderResult) _then;

/// Create a copy of ProviderResult
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? provider = null,Object? success = null,Object? processingTimeMs = null,Object? detections = null,Object? error = freezed,}) {
  return _then(_self.copyWith(
provider: null == provider ? _self.provider : provider // ignore: cast_nullable_to_non_nullable
as VisionProvider,success: null == success ? _self.success : success // ignore: cast_nullable_to_non_nullable
as bool,processingTimeMs: null == processingTimeMs ? _self.processingTimeMs : processingTimeMs // ignore: cast_nullable_to_non_nullable
as int,detections: null == detections ? _self.detections : detections // ignore: cast_nullable_to_non_nullable
as List<Detection>,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [ProviderResult].
extension ProviderResultPatterns on ProviderResult {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ProviderResult value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ProviderResult() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ProviderResult value)  $default,){
final _that = this;
switch (_that) {
case _ProviderResult():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ProviderResult value)?  $default,){
final _that = this;
switch (_that) {
case _ProviderResult() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( VisionProvider provider,  bool success,  int processingTimeMs,  List<Detection> detections,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ProviderResult() when $default != null:
return $default(_that.provider,_that.success,_that.processingTimeMs,_that.detections,_that.error);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( VisionProvider provider,  bool success,  int processingTimeMs,  List<Detection> detections,  String? error)  $default,) {final _that = this;
switch (_that) {
case _ProviderResult():
return $default(_that.provider,_that.success,_that.processingTimeMs,_that.detections,_that.error);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( VisionProvider provider,  bool success,  int processingTimeMs,  List<Detection> detections,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _ProviderResult() when $default != null:
return $default(_that.provider,_that.success,_that.processingTimeMs,_that.detections,_that.error);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ProviderResult implements ProviderResult {
  const _ProviderResult({required this.provider, required this.success, required this.processingTimeMs, required final  List<Detection> detections, this.error}): _detections = detections;
  factory _ProviderResult.fromJson(Map<String, dynamic> json) => _$ProviderResultFromJson(json);

/// Which provider returned this result
@override final  VisionProvider provider;
/// Whether the provider succeeded
@override final  bool success;
/// Processing time in milliseconds
@override final  int processingTimeMs;
/// Detections from this provider (empty if failed)
 final  List<Detection> _detections;
/// Detections from this provider (empty if failed)
@override List<Detection> get detections {
  if (_detections is EqualUnmodifiableListView) return _detections;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_detections);
}

/// Error message if failed
@override final  String? error;

/// Create a copy of ProviderResult
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ProviderResultCopyWith<_ProviderResult> get copyWith => __$ProviderResultCopyWithImpl<_ProviderResult>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ProviderResultToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ProviderResult&&(identical(other.provider, provider) || other.provider == provider)&&(identical(other.success, success) || other.success == success)&&(identical(other.processingTimeMs, processingTimeMs) || other.processingTimeMs == processingTimeMs)&&const DeepCollectionEquality().equals(other._detections, _detections)&&(identical(other.error, error) || other.error == error));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,provider,success,processingTimeMs,const DeepCollectionEquality().hash(_detections),error);

@override
String toString() {
  return 'ProviderResult(provider: $provider, success: $success, processingTimeMs: $processingTimeMs, detections: $detections, error: $error)';
}


}

/// @nodoc
abstract mixin class _$ProviderResultCopyWith<$Res> implements $ProviderResultCopyWith<$Res> {
  factory _$ProviderResultCopyWith(_ProviderResult value, $Res Function(_ProviderResult) _then) = __$ProviderResultCopyWithImpl;
@override @useResult
$Res call({
 VisionProvider provider, bool success, int processingTimeMs, List<Detection> detections, String? error
});




}
/// @nodoc
class __$ProviderResultCopyWithImpl<$Res>
    implements _$ProviderResultCopyWith<$Res> {
  __$ProviderResultCopyWithImpl(this._self, this._then);

  final _ProviderResult _self;
  final $Res Function(_ProviderResult) _then;

/// Create a copy of ProviderResult
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? provider = null,Object? success = null,Object? processingTimeMs = null,Object? detections = null,Object? error = freezed,}) {
  return _then(_ProviderResult(
provider: null == provider ? _self.provider : provider // ignore: cast_nullable_to_non_nullable
as VisionProvider,success: null == success ? _self.success : success // ignore: cast_nullable_to_non_nullable
as bool,processingTimeMs: null == processingTimeMs ? _self.processingTimeMs : processingTimeMs // ignore: cast_nullable_to_non_nullable
as int,detections: null == detections ? _self._detections : detections // ignore: cast_nullable_to_non_nullable
as List<Detection>,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
