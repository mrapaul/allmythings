// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'scene_observation.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$BBox {

 double get x; double get y; double get width; double get height;
/// Create a copy of BBox
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BBoxCopyWith<BBox> get copyWith => _$BBoxCopyWithImpl<BBox>(this as BBox, _$identity);

  /// Serializes this BBox to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BBox&&(identical(other.x, x) || other.x == x)&&(identical(other.y, y) || other.y == y)&&(identical(other.width, width) || other.width == width)&&(identical(other.height, height) || other.height == height));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,x,y,width,height);

@override
String toString() {
  return 'BBox(x: $x, y: $y, width: $width, height: $height)';
}


}

/// @nodoc
abstract mixin class $BBoxCopyWith<$Res>  {
  factory $BBoxCopyWith(BBox value, $Res Function(BBox) _then) = _$BBoxCopyWithImpl;
@useResult
$Res call({
 double x, double y, double width, double height
});




}
/// @nodoc
class _$BBoxCopyWithImpl<$Res>
    implements $BBoxCopyWith<$Res> {
  _$BBoxCopyWithImpl(this._self, this._then);

  final BBox _self;
  final $Res Function(BBox) _then;

/// Create a copy of BBox
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? x = null,Object? y = null,Object? width = null,Object? height = null,}) {
  return _then(_self.copyWith(
x: null == x ? _self.x : x // ignore: cast_nullable_to_non_nullable
as double,y: null == y ? _self.y : y // ignore: cast_nullable_to_non_nullable
as double,width: null == width ? _self.width : width // ignore: cast_nullable_to_non_nullable
as double,height: null == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [BBox].
extension BBoxPatterns on BBox {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BBox value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BBox() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BBox value)  $default,){
final _that = this;
switch (_that) {
case _BBox():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BBox value)?  $default,){
final _that = this;
switch (_that) {
case _BBox() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double x,  double y,  double width,  double height)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _BBox() when $default != null:
return $default(_that.x,_that.y,_that.width,_that.height);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double x,  double y,  double width,  double height)  $default,) {final _that = this;
switch (_that) {
case _BBox():
return $default(_that.x,_that.y,_that.width,_that.height);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double x,  double y,  double width,  double height)?  $default,) {final _that = this;
switch (_that) {
case _BBox() when $default != null:
return $default(_that.x,_that.y,_that.width,_that.height);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BBox implements BBox {
  const _BBox({required this.x, required this.y, required this.width, required this.height});
  factory _BBox.fromJson(Map<String, dynamic> json) => _$BBoxFromJson(json);

@override final  double x;
@override final  double y;
@override final  double width;
@override final  double height;

/// Create a copy of BBox
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BBoxCopyWith<_BBox> get copyWith => __$BBoxCopyWithImpl<_BBox>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BBoxToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BBox&&(identical(other.x, x) || other.x == x)&&(identical(other.y, y) || other.y == y)&&(identical(other.width, width) || other.width == width)&&(identical(other.height, height) || other.height == height));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,x,y,width,height);

@override
String toString() {
  return 'BBox(x: $x, y: $y, width: $width, height: $height)';
}


}

/// @nodoc
abstract mixin class _$BBoxCopyWith<$Res> implements $BBoxCopyWith<$Res> {
  factory _$BBoxCopyWith(_BBox value, $Res Function(_BBox) _then) = __$BBoxCopyWithImpl;
@override @useResult
$Res call({
 double x, double y, double width, double height
});




}
/// @nodoc
class __$BBoxCopyWithImpl<$Res>
    implements _$BBoxCopyWith<$Res> {
  __$BBoxCopyWithImpl(this._self, this._then);

  final _BBox _self;
  final $Res Function(_BBox) _then;

/// Create a copy of BBox
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? x = null,Object? y = null,Object? width = null,Object? height = null,}) {
  return _then(_BBox(
x: null == x ? _self.x : x // ignore: cast_nullable_to_non_nullable
as double,y: null == y ? _self.y : y // ignore: cast_nullable_to_non_nullable
as double,width: null == width ? _self.width : width // ignore: cast_nullable_to_non_nullable
as double,height: null == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$ContributingSignal {

 String get detector;// 'florence' | 'gdino' | 'gdino-sahi'
 String get frameId; double? get rawConfidence;
/// Create a copy of ContributingSignal
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ContributingSignalCopyWith<ContributingSignal> get copyWith => _$ContributingSignalCopyWithImpl<ContributingSignal>(this as ContributingSignal, _$identity);

  /// Serializes this ContributingSignal to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ContributingSignal&&(identical(other.detector, detector) || other.detector == detector)&&(identical(other.frameId, frameId) || other.frameId == frameId)&&(identical(other.rawConfidence, rawConfidence) || other.rawConfidence == rawConfidence));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,detector,frameId,rawConfidence);

@override
String toString() {
  return 'ContributingSignal(detector: $detector, frameId: $frameId, rawConfidence: $rawConfidence)';
}


}

/// @nodoc
abstract mixin class $ContributingSignalCopyWith<$Res>  {
  factory $ContributingSignalCopyWith(ContributingSignal value, $Res Function(ContributingSignal) _then) = _$ContributingSignalCopyWithImpl;
@useResult
$Res call({
 String detector, String frameId, double? rawConfidence
});




}
/// @nodoc
class _$ContributingSignalCopyWithImpl<$Res>
    implements $ContributingSignalCopyWith<$Res> {
  _$ContributingSignalCopyWithImpl(this._self, this._then);

  final ContributingSignal _self;
  final $Res Function(ContributingSignal) _then;

/// Create a copy of ContributingSignal
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? detector = null,Object? frameId = null,Object? rawConfidence = freezed,}) {
  return _then(_self.copyWith(
detector: null == detector ? _self.detector : detector // ignore: cast_nullable_to_non_nullable
as String,frameId: null == frameId ? _self.frameId : frameId // ignore: cast_nullable_to_non_nullable
as String,rawConfidence: freezed == rawConfidence ? _self.rawConfidence : rawConfidence // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}

}


/// Adds pattern-matching-related methods to [ContributingSignal].
extension ContributingSignalPatterns on ContributingSignal {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ContributingSignal value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ContributingSignal() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ContributingSignal value)  $default,){
final _that = this;
switch (_that) {
case _ContributingSignal():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ContributingSignal value)?  $default,){
final _that = this;
switch (_that) {
case _ContributingSignal() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String detector,  String frameId,  double? rawConfidence)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ContributingSignal() when $default != null:
return $default(_that.detector,_that.frameId,_that.rawConfidence);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String detector,  String frameId,  double? rawConfidence)  $default,) {final _that = this;
switch (_that) {
case _ContributingSignal():
return $default(_that.detector,_that.frameId,_that.rawConfidence);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String detector,  String frameId,  double? rawConfidence)?  $default,) {final _that = this;
switch (_that) {
case _ContributingSignal() when $default != null:
return $default(_that.detector,_that.frameId,_that.rawConfidence);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ContributingSignal implements ContributingSignal {
  const _ContributingSignal({required this.detector, required this.frameId, this.rawConfidence});
  factory _ContributingSignal.fromJson(Map<String, dynamic> json) => _$ContributingSignalFromJson(json);

@override final  String detector;
// 'florence' | 'gdino' | 'gdino-sahi'
@override final  String frameId;
@override final  double? rawConfidence;

/// Create a copy of ContributingSignal
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ContributingSignalCopyWith<_ContributingSignal> get copyWith => __$ContributingSignalCopyWithImpl<_ContributingSignal>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ContributingSignalToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ContributingSignal&&(identical(other.detector, detector) || other.detector == detector)&&(identical(other.frameId, frameId) || other.frameId == frameId)&&(identical(other.rawConfidence, rawConfidence) || other.rawConfidence == rawConfidence));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,detector,frameId,rawConfidence);

@override
String toString() {
  return 'ContributingSignal(detector: $detector, frameId: $frameId, rawConfidence: $rawConfidence)';
}


}

/// @nodoc
abstract mixin class _$ContributingSignalCopyWith<$Res> implements $ContributingSignalCopyWith<$Res> {
  factory _$ContributingSignalCopyWith(_ContributingSignal value, $Res Function(_ContributingSignal) _then) = __$ContributingSignalCopyWithImpl;
@override @useResult
$Res call({
 String detector, String frameId, double? rawConfidence
});




}
/// @nodoc
class __$ContributingSignalCopyWithImpl<$Res>
    implements _$ContributingSignalCopyWith<$Res> {
  __$ContributingSignalCopyWithImpl(this._self, this._then);

  final _ContributingSignal _self;
  final $Res Function(_ContributingSignal) _then;

/// Create a copy of ContributingSignal
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? detector = null,Object? frameId = null,Object? rawConfidence = freezed,}) {
  return _then(_ContributingSignal(
detector: null == detector ? _self.detector : detector // ignore: cast_nullable_to_non_nullable
as String,frameId: null == frameId ? _self.frameId : frameId // ignore: cast_nullable_to_non_nullable
as String,rawConfidence: freezed == rawConfidence ? _self.rawConfidence : rawConfidence // ignore: cast_nullable_to_non_nullable
as double?,
  ));
}


}


/// @nodoc
mixin _$AlternateLabel {

 String get label; double get confidence;
/// Create a copy of AlternateLabel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AlternateLabelCopyWith<AlternateLabel> get copyWith => _$AlternateLabelCopyWithImpl<AlternateLabel>(this as AlternateLabel, _$identity);

  /// Serializes this AlternateLabel to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AlternateLabel&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,confidence);

@override
String toString() {
  return 'AlternateLabel(label: $label, confidence: $confidence)';
}


}

/// @nodoc
abstract mixin class $AlternateLabelCopyWith<$Res>  {
  factory $AlternateLabelCopyWith(AlternateLabel value, $Res Function(AlternateLabel) _then) = _$AlternateLabelCopyWithImpl;
@useResult
$Res call({
 String label, double confidence
});




}
/// @nodoc
class _$AlternateLabelCopyWithImpl<$Res>
    implements $AlternateLabelCopyWith<$Res> {
  _$AlternateLabelCopyWithImpl(this._self, this._then);

  final AlternateLabel _self;
  final $Res Function(AlternateLabel) _then;

/// Create a copy of AlternateLabel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? label = null,Object? confidence = null,}) {
  return _then(_self.copyWith(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [AlternateLabel].
extension AlternateLabelPatterns on AlternateLabel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AlternateLabel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AlternateLabel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AlternateLabel value)  $default,){
final _that = this;
switch (_that) {
case _AlternateLabel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AlternateLabel value)?  $default,){
final _that = this;
switch (_that) {
case _AlternateLabel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String label,  double confidence)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AlternateLabel() when $default != null:
return $default(_that.label,_that.confidence);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String label,  double confidence)  $default,) {final _that = this;
switch (_that) {
case _AlternateLabel():
return $default(_that.label,_that.confidence);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String label,  double confidence)?  $default,) {final _that = this;
switch (_that) {
case _AlternateLabel() when $default != null:
return $default(_that.label,_that.confidence);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _AlternateLabel implements AlternateLabel {
  const _AlternateLabel({required this.label, required this.confidence});
  factory _AlternateLabel.fromJson(Map<String, dynamic> json) => _$AlternateLabelFromJson(json);

@override final  String label;
@override final  double confidence;

/// Create a copy of AlternateLabel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AlternateLabelCopyWith<_AlternateLabel> get copyWith => __$AlternateLabelCopyWithImpl<_AlternateLabel>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$AlternateLabelToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AlternateLabel&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,confidence);

@override
String toString() {
  return 'AlternateLabel(label: $label, confidence: $confidence)';
}


}

/// @nodoc
abstract mixin class _$AlternateLabelCopyWith<$Res> implements $AlternateLabelCopyWith<$Res> {
  factory _$AlternateLabelCopyWith(_AlternateLabel value, $Res Function(_AlternateLabel) _then) = __$AlternateLabelCopyWithImpl;
@override @useResult
$Res call({
 String label, double confidence
});




}
/// @nodoc
class __$AlternateLabelCopyWithImpl<$Res>
    implements _$AlternateLabelCopyWith<$Res> {
  __$AlternateLabelCopyWithImpl(this._self, this._then);

  final _AlternateLabel _self;
  final $Res Function(_AlternateLabel) _then;

/// Create a copy of AlternateLabel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? label = null,Object? confidence = null,}) {
  return _then(_AlternateLabel(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$OpError {

 String get op; String get code; String get message;
/// Create a copy of OpError
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$OpErrorCopyWith<OpError> get copyWith => _$OpErrorCopyWithImpl<OpError>(this as OpError, _$identity);

  /// Serializes this OpError to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is OpError&&(identical(other.op, op) || other.op == op)&&(identical(other.code, code) || other.code == code)&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,op,code,message);

@override
String toString() {
  return 'OpError(op: $op, code: $code, message: $message)';
}


}

/// @nodoc
abstract mixin class $OpErrorCopyWith<$Res>  {
  factory $OpErrorCopyWith(OpError value, $Res Function(OpError) _then) = _$OpErrorCopyWithImpl;
@useResult
$Res call({
 String op, String code, String message
});




}
/// @nodoc
class _$OpErrorCopyWithImpl<$Res>
    implements $OpErrorCopyWith<$Res> {
  _$OpErrorCopyWithImpl(this._self, this._then);

  final OpError _self;
  final $Res Function(OpError) _then;

/// Create a copy of OpError
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? op = null,Object? code = null,Object? message = null,}) {
  return _then(_self.copyWith(
op: null == op ? _self.op : op // ignore: cast_nullable_to_non_nullable
as String,code: null == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [OpError].
extension OpErrorPatterns on OpError {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _OpError value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _OpError() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _OpError value)  $default,){
final _that = this;
switch (_that) {
case _OpError():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _OpError value)?  $default,){
final _that = this;
switch (_that) {
case _OpError() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String op,  String code,  String message)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _OpError() when $default != null:
return $default(_that.op,_that.code,_that.message);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String op,  String code,  String message)  $default,) {final _that = this;
switch (_that) {
case _OpError():
return $default(_that.op,_that.code,_that.message);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String op,  String code,  String message)?  $default,) {final _that = this;
switch (_that) {
case _OpError() when $default != null:
return $default(_that.op,_that.code,_that.message);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _OpError implements OpError {
  const _OpError({required this.op, required this.code, required this.message});
  factory _OpError.fromJson(Map<String, dynamic> json) => _$OpErrorFromJson(json);

@override final  String op;
@override final  String code;
@override final  String message;

/// Create a copy of OpError
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$OpErrorCopyWith<_OpError> get copyWith => __$OpErrorCopyWithImpl<_OpError>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$OpErrorToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _OpError&&(identical(other.op, op) || other.op == op)&&(identical(other.code, code) || other.code == code)&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,op,code,message);

@override
String toString() {
  return 'OpError(op: $op, code: $code, message: $message)';
}


}

/// @nodoc
abstract mixin class _$OpErrorCopyWith<$Res> implements $OpErrorCopyWith<$Res> {
  factory _$OpErrorCopyWith(_OpError value, $Res Function(_OpError) _then) = __$OpErrorCopyWithImpl;
@override @useResult
$Res call({
 String op, String code, String message
});




}
/// @nodoc
class __$OpErrorCopyWithImpl<$Res>
    implements _$OpErrorCopyWith<$Res> {
  __$OpErrorCopyWithImpl(this._self, this._then);

  final _OpError _self;
  final $Res Function(_OpError) _then;

/// Create a copy of OpError
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? op = null,Object? code = null,Object? message = null,}) {
  return _then(_OpError(
op: null == op ? _self.op : op // ignore: cast_nullable_to_non_nullable
as String,code: null == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$TileError {

 int get tileIndex; String get code; String get message;
/// Create a copy of TileError
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$TileErrorCopyWith<TileError> get copyWith => _$TileErrorCopyWithImpl<TileError>(this as TileError, _$identity);

  /// Serializes this TileError to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is TileError&&(identical(other.tileIndex, tileIndex) || other.tileIndex == tileIndex)&&(identical(other.code, code) || other.code == code)&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,tileIndex,code,message);

@override
String toString() {
  return 'TileError(tileIndex: $tileIndex, code: $code, message: $message)';
}


}

/// @nodoc
abstract mixin class $TileErrorCopyWith<$Res>  {
  factory $TileErrorCopyWith(TileError value, $Res Function(TileError) _then) = _$TileErrorCopyWithImpl;
@useResult
$Res call({
 int tileIndex, String code, String message
});




}
/// @nodoc
class _$TileErrorCopyWithImpl<$Res>
    implements $TileErrorCopyWith<$Res> {
  _$TileErrorCopyWithImpl(this._self, this._then);

  final TileError _self;
  final $Res Function(TileError) _then;

/// Create a copy of TileError
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? tileIndex = null,Object? code = null,Object? message = null,}) {
  return _then(_self.copyWith(
tileIndex: null == tileIndex ? _self.tileIndex : tileIndex // ignore: cast_nullable_to_non_nullable
as int,code: null == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}

}


/// Adds pattern-matching-related methods to [TileError].
extension TileErrorPatterns on TileError {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _TileError value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _TileError() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _TileError value)  $default,){
final _that = this;
switch (_that) {
case _TileError():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _TileError value)?  $default,){
final _that = this;
switch (_that) {
case _TileError() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int tileIndex,  String code,  String message)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _TileError() when $default != null:
return $default(_that.tileIndex,_that.code,_that.message);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int tileIndex,  String code,  String message)  $default,) {final _that = this;
switch (_that) {
case _TileError():
return $default(_that.tileIndex,_that.code,_that.message);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int tileIndex,  String code,  String message)?  $default,) {final _that = this;
switch (_that) {
case _TileError() when $default != null:
return $default(_that.tileIndex,_that.code,_that.message);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _TileError implements TileError {
  const _TileError({required this.tileIndex, required this.code, required this.message});
  factory _TileError.fromJson(Map<String, dynamic> json) => _$TileErrorFromJson(json);

@override final  int tileIndex;
@override final  String code;
@override final  String message;

/// Create a copy of TileError
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$TileErrorCopyWith<_TileError> get copyWith => __$TileErrorCopyWithImpl<_TileError>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$TileErrorToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _TileError&&(identical(other.tileIndex, tileIndex) || other.tileIndex == tileIndex)&&(identical(other.code, code) || other.code == code)&&(identical(other.message, message) || other.message == message));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,tileIndex,code,message);

@override
String toString() {
  return 'TileError(tileIndex: $tileIndex, code: $code, message: $message)';
}


}

/// @nodoc
abstract mixin class _$TileErrorCopyWith<$Res> implements $TileErrorCopyWith<$Res> {
  factory _$TileErrorCopyWith(_TileError value, $Res Function(_TileError) _then) = __$TileErrorCopyWithImpl;
@override @useResult
$Res call({
 int tileIndex, String code, String message
});




}
/// @nodoc
class __$TileErrorCopyWithImpl<$Res>
    implements _$TileErrorCopyWith<$Res> {
  __$TileErrorCopyWithImpl(this._self, this._then);

  final _TileError _self;
  final $Res Function(_TileError) _then;

/// Create a copy of TileError
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? tileIndex = null,Object? code = null,Object? message = null,}) {
  return _then(_TileError(
tileIndex: null == tileIndex ? _self.tileIndex : tileIndex // ignore: cast_nullable_to_non_nullable
as int,code: null == code ? _self.code : code // ignore: cast_nullable_to_non_nullable
as String,message: null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}


/// @nodoc
mixin _$PipelineDetection {

 String get id; BBox get bbox; String? get maskRleB64; String? get cropEmbeddingB64; String get primaryLabel; List<AlternateLabel> get alternateLabels;/// May legitimately be {} when classification_refine cascades through
/// every VLM tier without producing attributes — item_detail must
/// render this without crashing (see scene_observation_test).
 Map<String, dynamic> get vlmStructuredAttributes; double get agreementScore; List<ContributingSignal> get contributingSignals; double get confidence;
/// Create a copy of PipelineDetection
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PipelineDetectionCopyWith<PipelineDetection> get copyWith => _$PipelineDetectionCopyWithImpl<PipelineDetection>(this as PipelineDetection, _$identity);

  /// Serializes this PipelineDetection to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PipelineDetection&&(identical(other.id, id) || other.id == id)&&(identical(other.bbox, bbox) || other.bbox == bbox)&&(identical(other.maskRleB64, maskRleB64) || other.maskRleB64 == maskRleB64)&&(identical(other.cropEmbeddingB64, cropEmbeddingB64) || other.cropEmbeddingB64 == cropEmbeddingB64)&&(identical(other.primaryLabel, primaryLabel) || other.primaryLabel == primaryLabel)&&const DeepCollectionEquality().equals(other.alternateLabels, alternateLabels)&&const DeepCollectionEquality().equals(other.vlmStructuredAttributes, vlmStructuredAttributes)&&(identical(other.agreementScore, agreementScore) || other.agreementScore == agreementScore)&&const DeepCollectionEquality().equals(other.contributingSignals, contributingSignals)&&(identical(other.confidence, confidence) || other.confidence == confidence));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,bbox,maskRleB64,cropEmbeddingB64,primaryLabel,const DeepCollectionEquality().hash(alternateLabels),const DeepCollectionEquality().hash(vlmStructuredAttributes),agreementScore,const DeepCollectionEquality().hash(contributingSignals),confidence);

@override
String toString() {
  return 'PipelineDetection(id: $id, bbox: $bbox, maskRleB64: $maskRleB64, cropEmbeddingB64: $cropEmbeddingB64, primaryLabel: $primaryLabel, alternateLabels: $alternateLabels, vlmStructuredAttributes: $vlmStructuredAttributes, agreementScore: $agreementScore, contributingSignals: $contributingSignals, confidence: $confidence)';
}


}

/// @nodoc
abstract mixin class $PipelineDetectionCopyWith<$Res>  {
  factory $PipelineDetectionCopyWith(PipelineDetection value, $Res Function(PipelineDetection) _then) = _$PipelineDetectionCopyWithImpl;
@useResult
$Res call({
 String id, BBox bbox, String? maskRleB64, String? cropEmbeddingB64, String primaryLabel, List<AlternateLabel> alternateLabels, Map<String, dynamic> vlmStructuredAttributes, double agreementScore, List<ContributingSignal> contributingSignals, double confidence
});


$BBoxCopyWith<$Res> get bbox;

}
/// @nodoc
class _$PipelineDetectionCopyWithImpl<$Res>
    implements $PipelineDetectionCopyWith<$Res> {
  _$PipelineDetectionCopyWithImpl(this._self, this._then);

  final PipelineDetection _self;
  final $Res Function(PipelineDetection) _then;

/// Create a copy of PipelineDetection
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? bbox = null,Object? maskRleB64 = freezed,Object? cropEmbeddingB64 = freezed,Object? primaryLabel = null,Object? alternateLabels = null,Object? vlmStructuredAttributes = null,Object? agreementScore = null,Object? contributingSignals = null,Object? confidence = null,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,bbox: null == bbox ? _self.bbox : bbox // ignore: cast_nullable_to_non_nullable
as BBox,maskRleB64: freezed == maskRleB64 ? _self.maskRleB64 : maskRleB64 // ignore: cast_nullable_to_non_nullable
as String?,cropEmbeddingB64: freezed == cropEmbeddingB64 ? _self.cropEmbeddingB64 : cropEmbeddingB64 // ignore: cast_nullable_to_non_nullable
as String?,primaryLabel: null == primaryLabel ? _self.primaryLabel : primaryLabel // ignore: cast_nullable_to_non_nullable
as String,alternateLabels: null == alternateLabels ? _self.alternateLabels : alternateLabels // ignore: cast_nullable_to_non_nullable
as List<AlternateLabel>,vlmStructuredAttributes: null == vlmStructuredAttributes ? _self.vlmStructuredAttributes : vlmStructuredAttributes // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,agreementScore: null == agreementScore ? _self.agreementScore : agreementScore // ignore: cast_nullable_to_non_nullable
as double,contributingSignals: null == contributingSignals ? _self.contributingSignals : contributingSignals // ignore: cast_nullable_to_non_nullable
as List<ContributingSignal>,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,
  ));
}
/// Create a copy of PipelineDetection
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BBoxCopyWith<$Res> get bbox {
  
  return $BBoxCopyWith<$Res>(_self.bbox, (value) {
    return _then(_self.copyWith(bbox: value));
  });
}
}


/// Adds pattern-matching-related methods to [PipelineDetection].
extension PipelineDetectionPatterns on PipelineDetection {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PipelineDetection value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PipelineDetection() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PipelineDetection value)  $default,){
final _that = this;
switch (_that) {
case _PipelineDetection():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PipelineDetection value)?  $default,){
final _that = this;
switch (_that) {
case _PipelineDetection() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  BBox bbox,  String? maskRleB64,  String? cropEmbeddingB64,  String primaryLabel,  List<AlternateLabel> alternateLabels,  Map<String, dynamic> vlmStructuredAttributes,  double agreementScore,  List<ContributingSignal> contributingSignals,  double confidence)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PipelineDetection() when $default != null:
return $default(_that.id,_that.bbox,_that.maskRleB64,_that.cropEmbeddingB64,_that.primaryLabel,_that.alternateLabels,_that.vlmStructuredAttributes,_that.agreementScore,_that.contributingSignals,_that.confidence);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  BBox bbox,  String? maskRleB64,  String? cropEmbeddingB64,  String primaryLabel,  List<AlternateLabel> alternateLabels,  Map<String, dynamic> vlmStructuredAttributes,  double agreementScore,  List<ContributingSignal> contributingSignals,  double confidence)  $default,) {final _that = this;
switch (_that) {
case _PipelineDetection():
return $default(_that.id,_that.bbox,_that.maskRleB64,_that.cropEmbeddingB64,_that.primaryLabel,_that.alternateLabels,_that.vlmStructuredAttributes,_that.agreementScore,_that.contributingSignals,_that.confidence);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  BBox bbox,  String? maskRleB64,  String? cropEmbeddingB64,  String primaryLabel,  List<AlternateLabel> alternateLabels,  Map<String, dynamic> vlmStructuredAttributes,  double agreementScore,  List<ContributingSignal> contributingSignals,  double confidence)?  $default,) {final _that = this;
switch (_that) {
case _PipelineDetection() when $default != null:
return $default(_that.id,_that.bbox,_that.maskRleB64,_that.cropEmbeddingB64,_that.primaryLabel,_that.alternateLabels,_that.vlmStructuredAttributes,_that.agreementScore,_that.contributingSignals,_that.confidence);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PipelineDetection implements PipelineDetection {
  const _PipelineDetection({required this.id, required this.bbox, this.maskRleB64, this.cropEmbeddingB64, required this.primaryLabel, final  List<AlternateLabel> alternateLabels = const <AlternateLabel>[], final  Map<String, dynamic> vlmStructuredAttributes = const <String, dynamic>{}, this.agreementScore = 0.0, final  List<ContributingSignal> contributingSignals = const <ContributingSignal>[], this.confidence = 0.0}): _alternateLabels = alternateLabels,_vlmStructuredAttributes = vlmStructuredAttributes,_contributingSignals = contributingSignals;
  factory _PipelineDetection.fromJson(Map<String, dynamic> json) => _$PipelineDetectionFromJson(json);

@override final  String id;
@override final  BBox bbox;
@override final  String? maskRleB64;
@override final  String? cropEmbeddingB64;
@override final  String primaryLabel;
 final  List<AlternateLabel> _alternateLabels;
@override@JsonKey() List<AlternateLabel> get alternateLabels {
  if (_alternateLabels is EqualUnmodifiableListView) return _alternateLabels;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alternateLabels);
}

/// May legitimately be {} when classification_refine cascades through
/// every VLM tier without producing attributes — item_detail must
/// render this without crashing (see scene_observation_test).
 final  Map<String, dynamic> _vlmStructuredAttributes;
/// May legitimately be {} when classification_refine cascades through
/// every VLM tier without producing attributes — item_detail must
/// render this without crashing (see scene_observation_test).
@override@JsonKey() Map<String, dynamic> get vlmStructuredAttributes {
  if (_vlmStructuredAttributes is EqualUnmodifiableMapView) return _vlmStructuredAttributes;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_vlmStructuredAttributes);
}

@override@JsonKey() final  double agreementScore;
 final  List<ContributingSignal> _contributingSignals;
@override@JsonKey() List<ContributingSignal> get contributingSignals {
  if (_contributingSignals is EqualUnmodifiableListView) return _contributingSignals;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_contributingSignals);
}

@override@JsonKey() final  double confidence;

/// Create a copy of PipelineDetection
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PipelineDetectionCopyWith<_PipelineDetection> get copyWith => __$PipelineDetectionCopyWithImpl<_PipelineDetection>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PipelineDetectionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PipelineDetection&&(identical(other.id, id) || other.id == id)&&(identical(other.bbox, bbox) || other.bbox == bbox)&&(identical(other.maskRleB64, maskRleB64) || other.maskRleB64 == maskRleB64)&&(identical(other.cropEmbeddingB64, cropEmbeddingB64) || other.cropEmbeddingB64 == cropEmbeddingB64)&&(identical(other.primaryLabel, primaryLabel) || other.primaryLabel == primaryLabel)&&const DeepCollectionEquality().equals(other._alternateLabels, _alternateLabels)&&const DeepCollectionEquality().equals(other._vlmStructuredAttributes, _vlmStructuredAttributes)&&(identical(other.agreementScore, agreementScore) || other.agreementScore == agreementScore)&&const DeepCollectionEquality().equals(other._contributingSignals, _contributingSignals)&&(identical(other.confidence, confidence) || other.confidence == confidence));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,bbox,maskRleB64,cropEmbeddingB64,primaryLabel,const DeepCollectionEquality().hash(_alternateLabels),const DeepCollectionEquality().hash(_vlmStructuredAttributes),agreementScore,const DeepCollectionEquality().hash(_contributingSignals),confidence);

@override
String toString() {
  return 'PipelineDetection(id: $id, bbox: $bbox, maskRleB64: $maskRleB64, cropEmbeddingB64: $cropEmbeddingB64, primaryLabel: $primaryLabel, alternateLabels: $alternateLabels, vlmStructuredAttributes: $vlmStructuredAttributes, agreementScore: $agreementScore, contributingSignals: $contributingSignals, confidence: $confidence)';
}


}

/// @nodoc
abstract mixin class _$PipelineDetectionCopyWith<$Res> implements $PipelineDetectionCopyWith<$Res> {
  factory _$PipelineDetectionCopyWith(_PipelineDetection value, $Res Function(_PipelineDetection) _then) = __$PipelineDetectionCopyWithImpl;
@override @useResult
$Res call({
 String id, BBox bbox, String? maskRleB64, String? cropEmbeddingB64, String primaryLabel, List<AlternateLabel> alternateLabels, Map<String, dynamic> vlmStructuredAttributes, double agreementScore, List<ContributingSignal> contributingSignals, double confidence
});


@override $BBoxCopyWith<$Res> get bbox;

}
/// @nodoc
class __$PipelineDetectionCopyWithImpl<$Res>
    implements _$PipelineDetectionCopyWith<$Res> {
  __$PipelineDetectionCopyWithImpl(this._self, this._then);

  final _PipelineDetection _self;
  final $Res Function(_PipelineDetection) _then;

/// Create a copy of PipelineDetection
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? bbox = null,Object? maskRleB64 = freezed,Object? cropEmbeddingB64 = freezed,Object? primaryLabel = null,Object? alternateLabels = null,Object? vlmStructuredAttributes = null,Object? agreementScore = null,Object? contributingSignals = null,Object? confidence = null,}) {
  return _then(_PipelineDetection(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,bbox: null == bbox ? _self.bbox : bbox // ignore: cast_nullable_to_non_nullable
as BBox,maskRleB64: freezed == maskRleB64 ? _self.maskRleB64 : maskRleB64 // ignore: cast_nullable_to_non_nullable
as String?,cropEmbeddingB64: freezed == cropEmbeddingB64 ? _self.cropEmbeddingB64 : cropEmbeddingB64 // ignore: cast_nullable_to_non_nullable
as String?,primaryLabel: null == primaryLabel ? _self.primaryLabel : primaryLabel // ignore: cast_nullable_to_non_nullable
as String,alternateLabels: null == alternateLabels ? _self._alternateLabels : alternateLabels // ignore: cast_nullable_to_non_nullable
as List<AlternateLabel>,vlmStructuredAttributes: null == vlmStructuredAttributes ? _self._vlmStructuredAttributes : vlmStructuredAttributes // ignore: cast_nullable_to_non_nullable
as Map<String, dynamic>,agreementScore: null == agreementScore ? _self.agreementScore : agreementScore // ignore: cast_nullable_to_non_nullable
as double,contributingSignals: null == contributingSignals ? _self._contributingSignals : contributingSignals // ignore: cast_nullable_to_non_nullable
as List<ContributingSignal>,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

/// Create a copy of PipelineDetection
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BBoxCopyWith<$Res> get bbox {
  
  return $BBoxCopyWith<$Res>(_self.bbox, (value) {
    return _then(_self.copyWith(bbox: value));
  });
}
}


/// @nodoc
mixin _$SceneObservation {

 String get sceneId; String get runId; List<String> get frameIds; List<PipelineDetection> get detections; double get agreementCoverage; double get agreementPrecision; bool get selfDiagnosisTriggered; int get rerunDepth; bool get flagged; String? get flagReason; int get processingMs; List<OpError> get errors; List<TileError> get tileErrors;
/// Create a copy of SceneObservation
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$SceneObservationCopyWith<SceneObservation> get copyWith => _$SceneObservationCopyWithImpl<SceneObservation>(this as SceneObservation, _$identity);

  /// Serializes this SceneObservation to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is SceneObservation&&(identical(other.sceneId, sceneId) || other.sceneId == sceneId)&&(identical(other.runId, runId) || other.runId == runId)&&const DeepCollectionEquality().equals(other.frameIds, frameIds)&&const DeepCollectionEquality().equals(other.detections, detections)&&(identical(other.agreementCoverage, agreementCoverage) || other.agreementCoverage == agreementCoverage)&&(identical(other.agreementPrecision, agreementPrecision) || other.agreementPrecision == agreementPrecision)&&(identical(other.selfDiagnosisTriggered, selfDiagnosisTriggered) || other.selfDiagnosisTriggered == selfDiagnosisTriggered)&&(identical(other.rerunDepth, rerunDepth) || other.rerunDepth == rerunDepth)&&(identical(other.flagged, flagged) || other.flagged == flagged)&&(identical(other.flagReason, flagReason) || other.flagReason == flagReason)&&(identical(other.processingMs, processingMs) || other.processingMs == processingMs)&&const DeepCollectionEquality().equals(other.errors, errors)&&const DeepCollectionEquality().equals(other.tileErrors, tileErrors));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,sceneId,runId,const DeepCollectionEquality().hash(frameIds),const DeepCollectionEquality().hash(detections),agreementCoverage,agreementPrecision,selfDiagnosisTriggered,rerunDepth,flagged,flagReason,processingMs,const DeepCollectionEquality().hash(errors),const DeepCollectionEquality().hash(tileErrors));

@override
String toString() {
  return 'SceneObservation(sceneId: $sceneId, runId: $runId, frameIds: $frameIds, detections: $detections, agreementCoverage: $agreementCoverage, agreementPrecision: $agreementPrecision, selfDiagnosisTriggered: $selfDiagnosisTriggered, rerunDepth: $rerunDepth, flagged: $flagged, flagReason: $flagReason, processingMs: $processingMs, errors: $errors, tileErrors: $tileErrors)';
}


}

/// @nodoc
abstract mixin class $SceneObservationCopyWith<$Res>  {
  factory $SceneObservationCopyWith(SceneObservation value, $Res Function(SceneObservation) _then) = _$SceneObservationCopyWithImpl;
@useResult
$Res call({
 String sceneId, String runId, List<String> frameIds, List<PipelineDetection> detections, double agreementCoverage, double agreementPrecision, bool selfDiagnosisTriggered, int rerunDepth, bool flagged, String? flagReason, int processingMs, List<OpError> errors, List<TileError> tileErrors
});




}
/// @nodoc
class _$SceneObservationCopyWithImpl<$Res>
    implements $SceneObservationCopyWith<$Res> {
  _$SceneObservationCopyWithImpl(this._self, this._then);

  final SceneObservation _self;
  final $Res Function(SceneObservation) _then;

/// Create a copy of SceneObservation
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? sceneId = null,Object? runId = null,Object? frameIds = null,Object? detections = null,Object? agreementCoverage = null,Object? agreementPrecision = null,Object? selfDiagnosisTriggered = null,Object? rerunDepth = null,Object? flagged = null,Object? flagReason = freezed,Object? processingMs = null,Object? errors = null,Object? tileErrors = null,}) {
  return _then(_self.copyWith(
sceneId: null == sceneId ? _self.sceneId : sceneId // ignore: cast_nullable_to_non_nullable
as String,runId: null == runId ? _self.runId : runId // ignore: cast_nullable_to_non_nullable
as String,frameIds: null == frameIds ? _self.frameIds : frameIds // ignore: cast_nullable_to_non_nullable
as List<String>,detections: null == detections ? _self.detections : detections // ignore: cast_nullable_to_non_nullable
as List<PipelineDetection>,agreementCoverage: null == agreementCoverage ? _self.agreementCoverage : agreementCoverage // ignore: cast_nullable_to_non_nullable
as double,agreementPrecision: null == agreementPrecision ? _self.agreementPrecision : agreementPrecision // ignore: cast_nullable_to_non_nullable
as double,selfDiagnosisTriggered: null == selfDiagnosisTriggered ? _self.selfDiagnosisTriggered : selfDiagnosisTriggered // ignore: cast_nullable_to_non_nullable
as bool,rerunDepth: null == rerunDepth ? _self.rerunDepth : rerunDepth // ignore: cast_nullable_to_non_nullable
as int,flagged: null == flagged ? _self.flagged : flagged // ignore: cast_nullable_to_non_nullable
as bool,flagReason: freezed == flagReason ? _self.flagReason : flagReason // ignore: cast_nullable_to_non_nullable
as String?,processingMs: null == processingMs ? _self.processingMs : processingMs // ignore: cast_nullable_to_non_nullable
as int,errors: null == errors ? _self.errors : errors // ignore: cast_nullable_to_non_nullable
as List<OpError>,tileErrors: null == tileErrors ? _self.tileErrors : tileErrors // ignore: cast_nullable_to_non_nullable
as List<TileError>,
  ));
}

}


/// Adds pattern-matching-related methods to [SceneObservation].
extension SceneObservationPatterns on SceneObservation {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _SceneObservation value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _SceneObservation() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _SceneObservation value)  $default,){
final _that = this;
switch (_that) {
case _SceneObservation():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _SceneObservation value)?  $default,){
final _that = this;
switch (_that) {
case _SceneObservation() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String sceneId,  String runId,  List<String> frameIds,  List<PipelineDetection> detections,  double agreementCoverage,  double agreementPrecision,  bool selfDiagnosisTriggered,  int rerunDepth,  bool flagged,  String? flagReason,  int processingMs,  List<OpError> errors,  List<TileError> tileErrors)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _SceneObservation() when $default != null:
return $default(_that.sceneId,_that.runId,_that.frameIds,_that.detections,_that.agreementCoverage,_that.agreementPrecision,_that.selfDiagnosisTriggered,_that.rerunDepth,_that.flagged,_that.flagReason,_that.processingMs,_that.errors,_that.tileErrors);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String sceneId,  String runId,  List<String> frameIds,  List<PipelineDetection> detections,  double agreementCoverage,  double agreementPrecision,  bool selfDiagnosisTriggered,  int rerunDepth,  bool flagged,  String? flagReason,  int processingMs,  List<OpError> errors,  List<TileError> tileErrors)  $default,) {final _that = this;
switch (_that) {
case _SceneObservation():
return $default(_that.sceneId,_that.runId,_that.frameIds,_that.detections,_that.agreementCoverage,_that.agreementPrecision,_that.selfDiagnosisTriggered,_that.rerunDepth,_that.flagged,_that.flagReason,_that.processingMs,_that.errors,_that.tileErrors);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String sceneId,  String runId,  List<String> frameIds,  List<PipelineDetection> detections,  double agreementCoverage,  double agreementPrecision,  bool selfDiagnosisTriggered,  int rerunDepth,  bool flagged,  String? flagReason,  int processingMs,  List<OpError> errors,  List<TileError> tileErrors)?  $default,) {final _that = this;
switch (_that) {
case _SceneObservation() when $default != null:
return $default(_that.sceneId,_that.runId,_that.frameIds,_that.detections,_that.agreementCoverage,_that.agreementPrecision,_that.selfDiagnosisTriggered,_that.rerunDepth,_that.flagged,_that.flagReason,_that.processingMs,_that.errors,_that.tileErrors);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _SceneObservation implements SceneObservation {
  const _SceneObservation({required this.sceneId, required this.runId, final  List<String> frameIds = const <String>[], final  List<PipelineDetection> detections = const <PipelineDetection>[], this.agreementCoverage = 0.0, this.agreementPrecision = 0.0, this.selfDiagnosisTriggered = false, this.rerunDepth = 0, this.flagged = false, this.flagReason, this.processingMs = 0, final  List<OpError> errors = const <OpError>[], final  List<TileError> tileErrors = const <TileError>[]}): _frameIds = frameIds,_detections = detections,_errors = errors,_tileErrors = tileErrors;
  factory _SceneObservation.fromJson(Map<String, dynamic> json) => _$SceneObservationFromJson(json);

@override final  String sceneId;
@override final  String runId;
 final  List<String> _frameIds;
@override@JsonKey() List<String> get frameIds {
  if (_frameIds is EqualUnmodifiableListView) return _frameIds;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_frameIds);
}

 final  List<PipelineDetection> _detections;
@override@JsonKey() List<PipelineDetection> get detections {
  if (_detections is EqualUnmodifiableListView) return _detections;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_detections);
}

@override@JsonKey() final  double agreementCoverage;
@override@JsonKey() final  double agreementPrecision;
@override@JsonKey() final  bool selfDiagnosisTriggered;
@override@JsonKey() final  int rerunDepth;
@override@JsonKey() final  bool flagged;
@override final  String? flagReason;
@override@JsonKey() final  int processingMs;
 final  List<OpError> _errors;
@override@JsonKey() List<OpError> get errors {
  if (_errors is EqualUnmodifiableListView) return _errors;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_errors);
}

 final  List<TileError> _tileErrors;
@override@JsonKey() List<TileError> get tileErrors {
  if (_tileErrors is EqualUnmodifiableListView) return _tileErrors;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_tileErrors);
}


/// Create a copy of SceneObservation
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$SceneObservationCopyWith<_SceneObservation> get copyWith => __$SceneObservationCopyWithImpl<_SceneObservation>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$SceneObservationToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _SceneObservation&&(identical(other.sceneId, sceneId) || other.sceneId == sceneId)&&(identical(other.runId, runId) || other.runId == runId)&&const DeepCollectionEquality().equals(other._frameIds, _frameIds)&&const DeepCollectionEquality().equals(other._detections, _detections)&&(identical(other.agreementCoverage, agreementCoverage) || other.agreementCoverage == agreementCoverage)&&(identical(other.agreementPrecision, agreementPrecision) || other.agreementPrecision == agreementPrecision)&&(identical(other.selfDiagnosisTriggered, selfDiagnosisTriggered) || other.selfDiagnosisTriggered == selfDiagnosisTriggered)&&(identical(other.rerunDepth, rerunDepth) || other.rerunDepth == rerunDepth)&&(identical(other.flagged, flagged) || other.flagged == flagged)&&(identical(other.flagReason, flagReason) || other.flagReason == flagReason)&&(identical(other.processingMs, processingMs) || other.processingMs == processingMs)&&const DeepCollectionEquality().equals(other._errors, _errors)&&const DeepCollectionEquality().equals(other._tileErrors, _tileErrors));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,sceneId,runId,const DeepCollectionEquality().hash(_frameIds),const DeepCollectionEquality().hash(_detections),agreementCoverage,agreementPrecision,selfDiagnosisTriggered,rerunDepth,flagged,flagReason,processingMs,const DeepCollectionEquality().hash(_errors),const DeepCollectionEquality().hash(_tileErrors));

@override
String toString() {
  return 'SceneObservation(sceneId: $sceneId, runId: $runId, frameIds: $frameIds, detections: $detections, agreementCoverage: $agreementCoverage, agreementPrecision: $agreementPrecision, selfDiagnosisTriggered: $selfDiagnosisTriggered, rerunDepth: $rerunDepth, flagged: $flagged, flagReason: $flagReason, processingMs: $processingMs, errors: $errors, tileErrors: $tileErrors)';
}


}

/// @nodoc
abstract mixin class _$SceneObservationCopyWith<$Res> implements $SceneObservationCopyWith<$Res> {
  factory _$SceneObservationCopyWith(_SceneObservation value, $Res Function(_SceneObservation) _then) = __$SceneObservationCopyWithImpl;
@override @useResult
$Res call({
 String sceneId, String runId, List<String> frameIds, List<PipelineDetection> detections, double agreementCoverage, double agreementPrecision, bool selfDiagnosisTriggered, int rerunDepth, bool flagged, String? flagReason, int processingMs, List<OpError> errors, List<TileError> tileErrors
});




}
/// @nodoc
class __$SceneObservationCopyWithImpl<$Res>
    implements _$SceneObservationCopyWith<$Res> {
  __$SceneObservationCopyWithImpl(this._self, this._then);

  final _SceneObservation _self;
  final $Res Function(_SceneObservation) _then;

/// Create a copy of SceneObservation
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? sceneId = null,Object? runId = null,Object? frameIds = null,Object? detections = null,Object? agreementCoverage = null,Object? agreementPrecision = null,Object? selfDiagnosisTriggered = null,Object? rerunDepth = null,Object? flagged = null,Object? flagReason = freezed,Object? processingMs = null,Object? errors = null,Object? tileErrors = null,}) {
  return _then(_SceneObservation(
sceneId: null == sceneId ? _self.sceneId : sceneId // ignore: cast_nullable_to_non_nullable
as String,runId: null == runId ? _self.runId : runId // ignore: cast_nullable_to_non_nullable
as String,frameIds: null == frameIds ? _self._frameIds : frameIds // ignore: cast_nullable_to_non_nullable
as List<String>,detections: null == detections ? _self._detections : detections // ignore: cast_nullable_to_non_nullable
as List<PipelineDetection>,agreementCoverage: null == agreementCoverage ? _self.agreementCoverage : agreementCoverage // ignore: cast_nullable_to_non_nullable
as double,agreementPrecision: null == agreementPrecision ? _self.agreementPrecision : agreementPrecision // ignore: cast_nullable_to_non_nullable
as double,selfDiagnosisTriggered: null == selfDiagnosisTriggered ? _self.selfDiagnosisTriggered : selfDiagnosisTriggered // ignore: cast_nullable_to_non_nullable
as bool,rerunDepth: null == rerunDepth ? _self.rerunDepth : rerunDepth // ignore: cast_nullable_to_non_nullable
as int,flagged: null == flagged ? _self.flagged : flagged // ignore: cast_nullable_to_non_nullable
as bool,flagReason: freezed == flagReason ? _self.flagReason : flagReason // ignore: cast_nullable_to_non_nullable
as String?,processingMs: null == processingMs ? _self.processingMs : processingMs // ignore: cast_nullable_to_non_nullable
as int,errors: null == errors ? _self._errors : errors // ignore: cast_nullable_to_non_nullable
as List<OpError>,tileErrors: null == tileErrors ? _self._tileErrors : tileErrors // ignore: cast_nullable_to_non_nullable
as List<TileError>,
  ));
}


}

// dart format on
