// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'scene_detection_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$SceneDetectionState {





@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneDetectionState);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'SceneDetectionState()';
}


}

/// @nodoc
class $SceneDetectionStateCopyWith<$Res>  {
$SceneDetectionStateCopyWith(SceneDetectionState _, $Res Function(SceneDetectionState) __);
}


/// Adds pattern-matching-related methods to [SceneDetectionState].
extension SceneDetectionStatePatterns on SceneDetectionState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>({TResult Function( SceneDetectionInitial value)?  initial,TResult Function( SceneDetectionLoading value)?  loading,TResult Function( SceneDetectionSuccess value)?  success,TResult Function( SceneDetectionEmpty value)?  empty,TResult Function( SceneDetectionError value)?  error,required TResult orElse(),}){
final _that = this;
switch (_that) {
case SceneDetectionInitial() when initial != null:
return initial(_that);case SceneDetectionLoading() when loading != null:
return loading(_that);case SceneDetectionSuccess() when success != null:
return success(_that);case SceneDetectionEmpty() when empty != null:
return empty(_that);case SceneDetectionError() when error != null:
return error(_that);case _:
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

@optionalTypeArgs TResult map<TResult extends Object?>({required TResult Function( SceneDetectionInitial value)  initial,required TResult Function( SceneDetectionLoading value)  loading,required TResult Function( SceneDetectionSuccess value)  success,required TResult Function( SceneDetectionEmpty value)  empty,required TResult Function( SceneDetectionError value)  error,}){
final _that = this;
switch (_that) {
case SceneDetectionInitial():
return initial(_that);case SceneDetectionLoading():
return loading(_that);case SceneDetectionSuccess():
return success(_that);case SceneDetectionEmpty():
return empty(_that);case SceneDetectionError():
return error(_that);}
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>({TResult? Function( SceneDetectionInitial value)?  initial,TResult? Function( SceneDetectionLoading value)?  loading,TResult? Function( SceneDetectionSuccess value)?  success,TResult? Function( SceneDetectionEmpty value)?  empty,TResult? Function( SceneDetectionError value)?  error,}){
final _that = this;
switch (_that) {
case SceneDetectionInitial() when initial != null:
return initial(_that);case SceneDetectionLoading() when loading != null:
return loading(_that);case SceneDetectionSuccess() when success != null:
return success(_that);case SceneDetectionEmpty() when empty != null:
return empty(_that);case SceneDetectionError() when error != null:
return error(_that);case _:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>({TResult Function()?  initial,TResult Function()?  loading,TResult Function( SceneObservation observation)?  success,TResult Function()?  empty,TResult Function( String message)?  error,required TResult orElse(),}) {final _that = this;
switch (_that) {
case SceneDetectionInitial() when initial != null:
return initial();case SceneDetectionLoading() when loading != null:
return loading();case SceneDetectionSuccess() when success != null:
return success(_that.observation);case SceneDetectionEmpty() when empty != null:
return empty();case SceneDetectionError() when error != null:
return error(_that.message);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>({required TResult Function()  initial,required TResult Function()  loading,required TResult Function( SceneObservation observation)  success,required TResult Function()  empty,required TResult Function( String message)  error,}) {final _that = this;
switch (_that) {
case SceneDetectionInitial():
return initial();case SceneDetectionLoading():
return loading();case SceneDetectionSuccess():
return success(_that.observation);case SceneDetectionEmpty():
return empty();case SceneDetectionError():
return error(_that.message);}
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>({TResult? Function()?  initial,TResult? Function()?  loading,TResult? Function( SceneObservation observation)?  success,TResult? Function()?  empty,TResult? Function( String message)?  error,}) {final _that = this;
switch (_that) {
case SceneDetectionInitial() when initial != null:
return initial();case SceneDetectionLoading() when loading != null:
return loading();case SceneDetectionSuccess() when success != null:
return success(_that.observation);case SceneDetectionEmpty() when empty != null:
return empty();case SceneDetectionError() when error != null:
return error(_that.message);case _:
  return null;

}
}

}

/// @nodoc


class SceneDetectionInitial implements SceneDetectionState {
  const SceneDetectionInitial();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneDetectionInitial);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'SceneDetectionState.initial()';
}


}




/// @nodoc


class SceneDetectionLoading implements SceneDetectionState {
  const SceneDetectionLoading();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneDetectionLoading);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'SceneDetectionState.loading()';
}


}




/// @nodoc


class SceneDetectionSuccess implements SceneDetectionState {
  const SceneDetectionSuccess({required this.observation});
  

 final  SceneObservation observation;

/// Create a copy of SceneDetectionState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SceneDetectionSuccessCopyWith<SceneDetectionSuccess> get copyWith => _$SceneDetectionSuccessCopyWithImpl<SceneDetectionSuccess>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneDetectionSuccess&&(identical(other.observation, observation) || other.observation == observation));
}


@override
int get hashCode => Object.hash(runtimeType,observation);

@override
String toString() {
  return 'SceneDetectionState.success(observation: $observation)';
}


}

/// @nodoc
abstract mixin class $SceneDetectionSuccessCopyWith<$Res> implements $SceneDetectionStateCopyWith<$Res> {
  factory $SceneDetectionSuccessCopyWith(SceneDetectionSuccess value, $Res Function(SceneDetectionSuccess) _then) = _$SceneDetectionSuccessCopyWithImpl;
@useResult
$Res call({
 SceneObservation observation
});


$SceneObservationCopyWith<$Res> get observation;

}
/// @nodoc
class _$SceneDetectionSuccessCopyWithImpl<$Res>
    implements $SceneDetectionSuccessCopyWith<$Res> {
  _$SceneDetectionSuccessCopyWithImpl(this._self, this._then);

  final SceneDetectionSuccess _self;
  final $Res Function(SceneDetectionSuccess) _then;

/// Create a copy of SceneDetectionState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? observation = null,}) {
  return _then(SceneDetectionSuccess(
observation: null == observation ? _self.observation : observation // ignore: cast_nullable_to_non_nullable
as SceneObservation,
  ));
}

/// Create a copy of SceneDetectionState
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$SceneObservationCopyWith<$Res> get observation {
  
  return $SceneObservationCopyWith<$Res>(_self.observation, (value) {
    return _then(_self.copyWith(observation: value));
  });
}
}

/// @nodoc


class SceneDetectionEmpty implements SceneDetectionState {
  const SceneDetectionEmpty();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneDetectionEmpty);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'SceneDetectionState.empty()';
}


}




/// @nodoc


class SceneDetectionError implements SceneDetectionState {
  const SceneDetectionError(this.message);
  

 final  String message;

/// Create a copy of SceneDetectionState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SceneDetectionErrorCopyWith<SceneDetectionError> get copyWith => _$SceneDetectionErrorCopyWithImpl<SceneDetectionError>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneDetectionError&&(identical(other.message, message) || other.message == message));
}


@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'SceneDetectionState.error(message: $message)';
}


}

/// @nodoc
abstract mixin class $SceneDetectionErrorCopyWith<$Res> implements $SceneDetectionStateCopyWith<$Res> {
  factory $SceneDetectionErrorCopyWith(SceneDetectionError value, $Res Function(SceneDetectionError) _then) = _$SceneDetectionErrorCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class _$SceneDetectionErrorCopyWithImpl<$Res>
    implements $SceneDetectionErrorCopyWith<$Res> {
  _$SceneDetectionErrorCopyWithImpl(this._self, this._then);

  final SceneDetectionError _self;
  final $Res Function(SceneDetectionError) _then;

/// Create a copy of SceneDetectionState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(SceneDetectionError(
null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

// dart format on
