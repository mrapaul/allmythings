// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'detection_state.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$DetectionState {





@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionState);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'DetectionState()';
}


}

/// @nodoc
class $DetectionStateCopyWith<$Res>  {
$DetectionStateCopyWith(DetectionState _, $Res Function(DetectionState) __);
}


/// Adds pattern-matching-related methods to [DetectionState].
extension DetectionStatePatterns on DetectionState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>({TResult Function( DetectionInitial value)?  initial,TResult Function( DetectionLoading value)?  loading,TResult Function( DetectionSuccess value)?  success,TResult Function( DetectionEmpty value)?  empty,TResult Function( DetectionError value)?  error,required TResult orElse(),}){
final _that = this;
switch (_that) {
case DetectionInitial() when initial != null:
return initial(_that);case DetectionLoading() when loading != null:
return loading(_that);case DetectionSuccess() when success != null:
return success(_that);case DetectionEmpty() when empty != null:
return empty(_that);case DetectionError() when error != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>({required TResult Function( DetectionInitial value)  initial,required TResult Function( DetectionLoading value)  loading,required TResult Function( DetectionSuccess value)  success,required TResult Function( DetectionEmpty value)  empty,required TResult Function( DetectionError value)  error,}){
final _that = this;
switch (_that) {
case DetectionInitial():
return initial(_that);case DetectionLoading():
return loading(_that);case DetectionSuccess():
return success(_that);case DetectionEmpty():
return empty(_that);case DetectionError():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>({TResult? Function( DetectionInitial value)?  initial,TResult? Function( DetectionLoading value)?  loading,TResult? Function( DetectionSuccess value)?  success,TResult? Function( DetectionEmpty value)?  empty,TResult? Function( DetectionError value)?  error,}){
final _that = this;
switch (_that) {
case DetectionInitial() when initial != null:
return initial(_that);case DetectionLoading() when loading != null:
return loading(_that);case DetectionSuccess() when success != null:
return success(_that);case DetectionEmpty() when empty != null:
return empty(_that);case DetectionError() when error != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>({TResult Function()?  initial,TResult Function()?  loading,TResult Function( List<DetectedObject> detections,  int processingTimeMs,  String detector,  String classifier,  int? corroborationCount)?  success,TResult Function()?  empty,TResult Function( String message)?  error,required TResult orElse(),}) {final _that = this;
switch (_that) {
case DetectionInitial() when initial != null:
return initial();case DetectionLoading() when loading != null:
return loading();case DetectionSuccess() when success != null:
return success(_that.detections,_that.processingTimeMs,_that.detector,_that.classifier,_that.corroborationCount);case DetectionEmpty() when empty != null:
return empty();case DetectionError() when error != null:
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

@optionalTypeArgs TResult when<TResult extends Object?>({required TResult Function()  initial,required TResult Function()  loading,required TResult Function( List<DetectedObject> detections,  int processingTimeMs,  String detector,  String classifier,  int? corroborationCount)  success,required TResult Function()  empty,required TResult Function( String message)  error,}) {final _that = this;
switch (_that) {
case DetectionInitial():
return initial();case DetectionLoading():
return loading();case DetectionSuccess():
return success(_that.detections,_that.processingTimeMs,_that.detector,_that.classifier,_that.corroborationCount);case DetectionEmpty():
return empty();case DetectionError():
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>({TResult? Function()?  initial,TResult? Function()?  loading,TResult? Function( List<DetectedObject> detections,  int processingTimeMs,  String detector,  String classifier,  int? corroborationCount)?  success,TResult? Function()?  empty,TResult? Function( String message)?  error,}) {final _that = this;
switch (_that) {
case DetectionInitial() when initial != null:
return initial();case DetectionLoading() when loading != null:
return loading();case DetectionSuccess() when success != null:
return success(_that.detections,_that.processingTimeMs,_that.detector,_that.classifier,_that.corroborationCount);case DetectionEmpty() when empty != null:
return empty();case DetectionError() when error != null:
return error(_that.message);case _:
  return null;

}
}

}

/// @nodoc


class DetectionInitial implements DetectionState {
  const DetectionInitial();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionInitial);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'DetectionState.initial()';
}


}




/// @nodoc


class DetectionLoading implements DetectionState {
  const DetectionLoading();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionLoading);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'DetectionState.loading()';
}


}




/// @nodoc


class DetectionSuccess implements DetectionState {
  const DetectionSuccess({required final  List<DetectedObject> detections, required this.processingTimeMs, required this.detector, required this.classifier, this.corroborationCount}): _detections = detections;
  

 final  List<DetectedObject> _detections;
 List<DetectedObject> get detections {
  if (_detections is EqualUnmodifiableListView) return _detections;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_detections);
}

 final  int processingTimeMs;
 final  String detector;
 final  String classifier;
 final  int? corroborationCount;

/// Create a copy of DetectionState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DetectionSuccessCopyWith<DetectionSuccess> get copyWith => _$DetectionSuccessCopyWithImpl<DetectionSuccess>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionSuccess&&const DeepCollectionEquality().equals(other._detections, _detections)&&(identical(other.processingTimeMs, processingTimeMs) || other.processingTimeMs == processingTimeMs)&&(identical(other.detector, detector) || other.detector == detector)&&(identical(other.classifier, classifier) || other.classifier == classifier)&&(identical(other.corroborationCount, corroborationCount) || other.corroborationCount == corroborationCount));
}


@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_detections),processingTimeMs,detector,classifier,corroborationCount);

@override
String toString() {
  return 'DetectionState.success(detections: $detections, processingTimeMs: $processingTimeMs, detector: $detector, classifier: $classifier, corroborationCount: $corroborationCount)';
}


}

/// @nodoc
abstract mixin class $DetectionSuccessCopyWith<$Res> implements $DetectionStateCopyWith<$Res> {
  factory $DetectionSuccessCopyWith(DetectionSuccess value, $Res Function(DetectionSuccess) _then) = _$DetectionSuccessCopyWithImpl;
@useResult
$Res call({
 List<DetectedObject> detections, int processingTimeMs, String detector, String classifier, int? corroborationCount
});




}
/// @nodoc
class _$DetectionSuccessCopyWithImpl<$Res>
    implements $DetectionSuccessCopyWith<$Res> {
  _$DetectionSuccessCopyWithImpl(this._self, this._then);

  final DetectionSuccess _self;
  final $Res Function(DetectionSuccess) _then;

/// Create a copy of DetectionState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? detections = null,Object? processingTimeMs = null,Object? detector = null,Object? classifier = null,Object? corroborationCount = freezed,}) {
  return _then(DetectionSuccess(
detections: null == detections ? _self._detections : detections // ignore: cast_nullable_to_non_nullable
as List<DetectedObject>,processingTimeMs: null == processingTimeMs ? _self.processingTimeMs : processingTimeMs // ignore: cast_nullable_to_non_nullable
as int,detector: null == detector ? _self.detector : detector // ignore: cast_nullable_to_non_nullable
as String,classifier: null == classifier ? _self.classifier : classifier // ignore: cast_nullable_to_non_nullable
as String,corroborationCount: freezed == corroborationCount ? _self.corroborationCount : corroborationCount // ignore: cast_nullable_to_non_nullable
as int?,
  ));
}


}

/// @nodoc


class DetectionEmpty implements DetectionState {
  const DetectionEmpty();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionEmpty);
}


@override
int get hashCode => runtimeType.hashCode;

@override
String toString() {
  return 'DetectionState.empty()';
}


}




/// @nodoc


class DetectionError implements DetectionState {
  const DetectionError(this.message);
  

 final  String message;

/// Create a copy of DetectionState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DetectionErrorCopyWith<DetectionError> get copyWith => _$DetectionErrorCopyWithImpl<DetectionError>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectionError&&(identical(other.message, message) || other.message == message));
}


@override
int get hashCode => Object.hash(runtimeType,message);

@override
String toString() {
  return 'DetectionState.error(message: $message)';
}


}

/// @nodoc
abstract mixin class $DetectionErrorCopyWith<$Res> implements $DetectionStateCopyWith<$Res> {
  factory $DetectionErrorCopyWith(DetectionError value, $Res Function(DetectionError) _then) = _$DetectionErrorCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class _$DetectionErrorCopyWithImpl<$Res>
    implements $DetectionErrorCopyWith<$Res> {
  _$DetectionErrorCopyWithImpl(this._self, this._then);

  final DetectionError _self;
  final $Res Function(DetectionError) _then;

/// Create a copy of DetectionState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(DetectionError(
null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

// dart format on
