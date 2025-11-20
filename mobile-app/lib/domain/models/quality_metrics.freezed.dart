// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'quality_metrics.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$QualityMetrics {

 bool get isBlurry; double get blurScore; double get brightness; double get contrast; ImageResolution get resolution; String get qualityLevel;// 'excellent', 'good', 'acceptable', 'poor'
 List<String> get feedback; String get recommendedAction;
/// Create a copy of QualityMetrics
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$QualityMetricsCopyWith<QualityMetrics> get copyWith => _$QualityMetricsCopyWithImpl<QualityMetrics>(this as QualityMetrics, _$identity);

  /// Serializes this QualityMetrics to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is QualityMetrics&&(identical(other.isBlurry, isBlurry) || other.isBlurry == isBlurry)&&(identical(other.blurScore, blurScore) || other.blurScore == blurScore)&&(identical(other.brightness, brightness) || other.brightness == brightness)&&(identical(other.contrast, contrast) || other.contrast == contrast)&&(identical(other.resolution, resolution) || other.resolution == resolution)&&(identical(other.qualityLevel, qualityLevel) || other.qualityLevel == qualityLevel)&&const DeepCollectionEquality().equals(other.feedback, feedback)&&(identical(other.recommendedAction, recommendedAction) || other.recommendedAction == recommendedAction));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,isBlurry,blurScore,brightness,contrast,resolution,qualityLevel,const DeepCollectionEquality().hash(feedback),recommendedAction);

@override
String toString() {
  return 'QualityMetrics(isBlurry: $isBlurry, blurScore: $blurScore, brightness: $brightness, contrast: $contrast, resolution: $resolution, qualityLevel: $qualityLevel, feedback: $feedback, recommendedAction: $recommendedAction)';
}


}

/// @nodoc
abstract mixin class $QualityMetricsCopyWith<$Res>  {
  factory $QualityMetricsCopyWith(QualityMetrics value, $Res Function(QualityMetrics) _then) = _$QualityMetricsCopyWithImpl;
@useResult
$Res call({
 bool isBlurry, double blurScore, double brightness, double contrast, ImageResolution resolution, String qualityLevel, List<String> feedback, String recommendedAction
});


$ImageResolutionCopyWith<$Res> get resolution;

}
/// @nodoc
class _$QualityMetricsCopyWithImpl<$Res>
    implements $QualityMetricsCopyWith<$Res> {
  _$QualityMetricsCopyWithImpl(this._self, this._then);

  final QualityMetrics _self;
  final $Res Function(QualityMetrics) _then;

/// Create a copy of QualityMetrics
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? isBlurry = null,Object? blurScore = null,Object? brightness = null,Object? contrast = null,Object? resolution = null,Object? qualityLevel = null,Object? feedback = null,Object? recommendedAction = null,}) {
  return _then(_self.copyWith(
isBlurry: null == isBlurry ? _self.isBlurry : isBlurry // ignore: cast_nullable_to_non_nullable
as bool,blurScore: null == blurScore ? _self.blurScore : blurScore // ignore: cast_nullable_to_non_nullable
as double,brightness: null == brightness ? _self.brightness : brightness // ignore: cast_nullable_to_non_nullable
as double,contrast: null == contrast ? _self.contrast : contrast // ignore: cast_nullable_to_non_nullable
as double,resolution: null == resolution ? _self.resolution : resolution // ignore: cast_nullable_to_non_nullable
as ImageResolution,qualityLevel: null == qualityLevel ? _self.qualityLevel : qualityLevel // ignore: cast_nullable_to_non_nullable
as String,feedback: null == feedback ? _self.feedback : feedback // ignore: cast_nullable_to_non_nullable
as List<String>,recommendedAction: null == recommendedAction ? _self.recommendedAction : recommendedAction // ignore: cast_nullable_to_non_nullable
as String,
  ));
}
/// Create a copy of QualityMetrics
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ImageResolutionCopyWith<$Res> get resolution {
  
  return $ImageResolutionCopyWith<$Res>(_self.resolution, (value) {
    return _then(_self.copyWith(resolution: value));
  });
}
}


/// Adds pattern-matching-related methods to [QualityMetrics].
extension QualityMetricsPatterns on QualityMetrics {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _QualityMetrics value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _QualityMetrics() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _QualityMetrics value)  $default,){
final _that = this;
switch (_that) {
case _QualityMetrics():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _QualityMetrics value)?  $default,){
final _that = this;
switch (_that) {
case _QualityMetrics() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( bool isBlurry,  double blurScore,  double brightness,  double contrast,  ImageResolution resolution,  String qualityLevel,  List<String> feedback,  String recommendedAction)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _QualityMetrics() when $default != null:
return $default(_that.isBlurry,_that.blurScore,_that.brightness,_that.contrast,_that.resolution,_that.qualityLevel,_that.feedback,_that.recommendedAction);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( bool isBlurry,  double blurScore,  double brightness,  double contrast,  ImageResolution resolution,  String qualityLevel,  List<String> feedback,  String recommendedAction)  $default,) {final _that = this;
switch (_that) {
case _QualityMetrics():
return $default(_that.isBlurry,_that.blurScore,_that.brightness,_that.contrast,_that.resolution,_that.qualityLevel,_that.feedback,_that.recommendedAction);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( bool isBlurry,  double blurScore,  double brightness,  double contrast,  ImageResolution resolution,  String qualityLevel,  List<String> feedback,  String recommendedAction)?  $default,) {final _that = this;
switch (_that) {
case _QualityMetrics() when $default != null:
return $default(_that.isBlurry,_that.blurScore,_that.brightness,_that.contrast,_that.resolution,_that.qualityLevel,_that.feedback,_that.recommendedAction);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _QualityMetrics implements QualityMetrics {
  const _QualityMetrics({required this.isBlurry, required this.blurScore, required this.brightness, required this.contrast, required this.resolution, required this.qualityLevel, required final  List<String> feedback, required this.recommendedAction}): _feedback = feedback;
  factory _QualityMetrics.fromJson(Map<String, dynamic> json) => _$QualityMetricsFromJson(json);

@override final  bool isBlurry;
@override final  double blurScore;
@override final  double brightness;
@override final  double contrast;
@override final  ImageResolution resolution;
@override final  String qualityLevel;
// 'excellent', 'good', 'acceptable', 'poor'
 final  List<String> _feedback;
// 'excellent', 'good', 'acceptable', 'poor'
@override List<String> get feedback {
  if (_feedback is EqualUnmodifiableListView) return _feedback;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_feedback);
}

@override final  String recommendedAction;

/// Create a copy of QualityMetrics
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$QualityMetricsCopyWith<_QualityMetrics> get copyWith => __$QualityMetricsCopyWithImpl<_QualityMetrics>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$QualityMetricsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _QualityMetrics&&(identical(other.isBlurry, isBlurry) || other.isBlurry == isBlurry)&&(identical(other.blurScore, blurScore) || other.blurScore == blurScore)&&(identical(other.brightness, brightness) || other.brightness == brightness)&&(identical(other.contrast, contrast) || other.contrast == contrast)&&(identical(other.resolution, resolution) || other.resolution == resolution)&&(identical(other.qualityLevel, qualityLevel) || other.qualityLevel == qualityLevel)&&const DeepCollectionEquality().equals(other._feedback, _feedback)&&(identical(other.recommendedAction, recommendedAction) || other.recommendedAction == recommendedAction));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,isBlurry,blurScore,brightness,contrast,resolution,qualityLevel,const DeepCollectionEquality().hash(_feedback),recommendedAction);

@override
String toString() {
  return 'QualityMetrics(isBlurry: $isBlurry, blurScore: $blurScore, brightness: $brightness, contrast: $contrast, resolution: $resolution, qualityLevel: $qualityLevel, feedback: $feedback, recommendedAction: $recommendedAction)';
}


}

/// @nodoc
abstract mixin class _$QualityMetricsCopyWith<$Res> implements $QualityMetricsCopyWith<$Res> {
  factory _$QualityMetricsCopyWith(_QualityMetrics value, $Res Function(_QualityMetrics) _then) = __$QualityMetricsCopyWithImpl;
@override @useResult
$Res call({
 bool isBlurry, double blurScore, double brightness, double contrast, ImageResolution resolution, String qualityLevel, List<String> feedback, String recommendedAction
});


@override $ImageResolutionCopyWith<$Res> get resolution;

}
/// @nodoc
class __$QualityMetricsCopyWithImpl<$Res>
    implements _$QualityMetricsCopyWith<$Res> {
  __$QualityMetricsCopyWithImpl(this._self, this._then);

  final _QualityMetrics _self;
  final $Res Function(_QualityMetrics) _then;

/// Create a copy of QualityMetrics
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? isBlurry = null,Object? blurScore = null,Object? brightness = null,Object? contrast = null,Object? resolution = null,Object? qualityLevel = null,Object? feedback = null,Object? recommendedAction = null,}) {
  return _then(_QualityMetrics(
isBlurry: null == isBlurry ? _self.isBlurry : isBlurry // ignore: cast_nullable_to_non_nullable
as bool,blurScore: null == blurScore ? _self.blurScore : blurScore // ignore: cast_nullable_to_non_nullable
as double,brightness: null == brightness ? _self.brightness : brightness // ignore: cast_nullable_to_non_nullable
as double,contrast: null == contrast ? _self.contrast : contrast // ignore: cast_nullable_to_non_nullable
as double,resolution: null == resolution ? _self.resolution : resolution // ignore: cast_nullable_to_non_nullable
as ImageResolution,qualityLevel: null == qualityLevel ? _self.qualityLevel : qualityLevel // ignore: cast_nullable_to_non_nullable
as String,feedback: null == feedback ? _self._feedback : feedback // ignore: cast_nullable_to_non_nullable
as List<String>,recommendedAction: null == recommendedAction ? _self.recommendedAction : recommendedAction // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

/// Create a copy of QualityMetrics
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ImageResolutionCopyWith<$Res> get resolution {
  
  return $ImageResolutionCopyWith<$Res>(_self.resolution, (value) {
    return _then(_self.copyWith(resolution: value));
  });
}
}


/// @nodoc
mixin _$ImageResolution {

 int get width; int get height; double get megapixels;
/// Create a copy of ImageResolution
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ImageResolutionCopyWith<ImageResolution> get copyWith => _$ImageResolutionCopyWithImpl<ImageResolution>(this as ImageResolution, _$identity);

  /// Serializes this ImageResolution to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ImageResolution&&(identical(other.width, width) || other.width == width)&&(identical(other.height, height) || other.height == height)&&(identical(other.megapixels, megapixels) || other.megapixels == megapixels));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,width,height,megapixels);

@override
String toString() {
  return 'ImageResolution(width: $width, height: $height, megapixels: $megapixels)';
}


}

/// @nodoc
abstract mixin class $ImageResolutionCopyWith<$Res>  {
  factory $ImageResolutionCopyWith(ImageResolution value, $Res Function(ImageResolution) _then) = _$ImageResolutionCopyWithImpl;
@useResult
$Res call({
 int width, int height, double megapixels
});




}
/// @nodoc
class _$ImageResolutionCopyWithImpl<$Res>
    implements $ImageResolutionCopyWith<$Res> {
  _$ImageResolutionCopyWithImpl(this._self, this._then);

  final ImageResolution _self;
  final $Res Function(ImageResolution) _then;

/// Create a copy of ImageResolution
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? width = null,Object? height = null,Object? megapixels = null,}) {
  return _then(_self.copyWith(
width: null == width ? _self.width : width // ignore: cast_nullable_to_non_nullable
as int,height: null == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as int,megapixels: null == megapixels ? _self.megapixels : megapixels // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [ImageResolution].
extension ImageResolutionPatterns on ImageResolution {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ImageResolution value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ImageResolution() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ImageResolution value)  $default,){
final _that = this;
switch (_that) {
case _ImageResolution():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ImageResolution value)?  $default,){
final _that = this;
switch (_that) {
case _ImageResolution() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int width,  int height,  double megapixels)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ImageResolution() when $default != null:
return $default(_that.width,_that.height,_that.megapixels);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int width,  int height,  double megapixels)  $default,) {final _that = this;
switch (_that) {
case _ImageResolution():
return $default(_that.width,_that.height,_that.megapixels);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int width,  int height,  double megapixels)?  $default,) {final _that = this;
switch (_that) {
case _ImageResolution() when $default != null:
return $default(_that.width,_that.height,_that.megapixels);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ImageResolution implements ImageResolution {
  const _ImageResolution({required this.width, required this.height, required this.megapixels});
  factory _ImageResolution.fromJson(Map<String, dynamic> json) => _$ImageResolutionFromJson(json);

@override final  int width;
@override final  int height;
@override final  double megapixels;

/// Create a copy of ImageResolution
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ImageResolutionCopyWith<_ImageResolution> get copyWith => __$ImageResolutionCopyWithImpl<_ImageResolution>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ImageResolutionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ImageResolution&&(identical(other.width, width) || other.width == width)&&(identical(other.height, height) || other.height == height)&&(identical(other.megapixels, megapixels) || other.megapixels == megapixels));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,width,height,megapixels);

@override
String toString() {
  return 'ImageResolution(width: $width, height: $height, megapixels: $megapixels)';
}


}

/// @nodoc
abstract mixin class _$ImageResolutionCopyWith<$Res> implements $ImageResolutionCopyWith<$Res> {
  factory _$ImageResolutionCopyWith(_ImageResolution value, $Res Function(_ImageResolution) _then) = __$ImageResolutionCopyWithImpl;
@override @useResult
$Res call({
 int width, int height, double megapixels
});




}
/// @nodoc
class __$ImageResolutionCopyWithImpl<$Res>
    implements _$ImageResolutionCopyWith<$Res> {
  __$ImageResolutionCopyWithImpl(this._self, this._then);

  final _ImageResolution _self;
  final $Res Function(_ImageResolution) _then;

/// Create a copy of ImageResolution
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? width = null,Object? height = null,Object? megapixels = null,}) {
  return _then(_ImageResolution(
width: null == width ? _self.width : width // ignore: cast_nullable_to_non_nullable
as int,height: null == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as int,megapixels: null == megapixels ? _self.megapixels : megapixels // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}

// dart format on
