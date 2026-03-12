// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'detected_object.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DetectedObject {

 int get boxIndex; String get label; String get category; double get confidence; BoundingBox get boundingBox; String? get brand; String? get model; List<String> get colors; List<String> get materials; String? get condition; ValueRange? get estimatedValue; String? get description;
/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DetectedObjectCopyWith<DetectedObject> get copyWith => _$DetectedObjectCopyWithImpl<DetectedObject>(this as DetectedObject, _$identity);

  /// Serializes this DetectedObject to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DetectedObject&&(identical(other.boxIndex, boxIndex) || other.boxIndex == boxIndex)&&(identical(other.label, label) || other.label == label)&&(identical(other.category, category) || other.category == category)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.boundingBox, boundingBox) || other.boundingBox == boundingBox)&&(identical(other.brand, brand) || other.brand == brand)&&(identical(other.model, model) || other.model == model)&&const DeepCollectionEquality().equals(other.colors, colors)&&const DeepCollectionEquality().equals(other.materials, materials)&&(identical(other.condition, condition) || other.condition == condition)&&(identical(other.estimatedValue, estimatedValue) || other.estimatedValue == estimatedValue)&&(identical(other.description, description) || other.description == description));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,boxIndex,label,category,confidence,boundingBox,brand,model,const DeepCollectionEquality().hash(colors),const DeepCollectionEquality().hash(materials),condition,estimatedValue,description);

@override
String toString() {
  return 'DetectedObject(boxIndex: $boxIndex, label: $label, category: $category, confidence: $confidence, boundingBox: $boundingBox, brand: $brand, model: $model, colors: $colors, materials: $materials, condition: $condition, estimatedValue: $estimatedValue, description: $description)';
}


}

/// @nodoc
abstract mixin class $DetectedObjectCopyWith<$Res>  {
  factory $DetectedObjectCopyWith(DetectedObject value, $Res Function(DetectedObject) _then) = _$DetectedObjectCopyWithImpl;
@useResult
$Res call({
 int boxIndex, String label, String category, double confidence, BoundingBox boundingBox, String? brand, String? model, List<String> colors, List<String> materials, String? condition, ValueRange? estimatedValue, String? description
});


$BoundingBoxCopyWith<$Res> get boundingBox;$ValueRangeCopyWith<$Res>? get estimatedValue;

}
/// @nodoc
class _$DetectedObjectCopyWithImpl<$Res>
    implements $DetectedObjectCopyWith<$Res> {
  _$DetectedObjectCopyWithImpl(this._self, this._then);

  final DetectedObject _self;
  final $Res Function(DetectedObject) _then;

/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? boxIndex = null,Object? label = null,Object? category = null,Object? confidence = null,Object? boundingBox = null,Object? brand = freezed,Object? model = freezed,Object? colors = null,Object? materials = null,Object? condition = freezed,Object? estimatedValue = freezed,Object? description = freezed,}) {
  return _then(_self.copyWith(
boxIndex: null == boxIndex ? _self.boxIndex : boxIndex // ignore: cast_nullable_to_non_nullable
as int,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,category: null == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,boundingBox: null == boundingBox ? _self.boundingBox : boundingBox // ignore: cast_nullable_to_non_nullable
as BoundingBox,brand: freezed == brand ? _self.brand : brand // ignore: cast_nullable_to_non_nullable
as String?,model: freezed == model ? _self.model : model // ignore: cast_nullable_to_non_nullable
as String?,colors: null == colors ? _self.colors : colors // ignore: cast_nullable_to_non_nullable
as List<String>,materials: null == materials ? _self.materials : materials // ignore: cast_nullable_to_non_nullable
as List<String>,condition: freezed == condition ? _self.condition : condition // ignore: cast_nullable_to_non_nullable
as String?,estimatedValue: freezed == estimatedValue ? _self.estimatedValue : estimatedValue // ignore: cast_nullable_to_non_nullable
as ValueRange?,description: freezed == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}
/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get boundingBox {
  
  return $BoundingBoxCopyWith<$Res>(_self.boundingBox, (value) {
    return _then(_self.copyWith(boundingBox: value));
  });
}/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ValueRangeCopyWith<$Res>? get estimatedValue {
    if (_self.estimatedValue == null) {
    return null;
  }

  return $ValueRangeCopyWith<$Res>(_self.estimatedValue!, (value) {
    return _then(_self.copyWith(estimatedValue: value));
  });
}
}


/// Adds pattern-matching-related methods to [DetectedObject].
extension DetectedObjectPatterns on DetectedObject {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DetectedObject value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DetectedObject() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DetectedObject value)  $default,){
final _that = this;
switch (_that) {
case _DetectedObject():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DetectedObject value)?  $default,){
final _that = this;
switch (_that) {
case _DetectedObject() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int boxIndex,  String label,  String category,  double confidence,  BoundingBox boundingBox,  String? brand,  String? model,  List<String> colors,  List<String> materials,  String? condition,  ValueRange? estimatedValue,  String? description)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DetectedObject() when $default != null:
return $default(_that.boxIndex,_that.label,_that.category,_that.confidence,_that.boundingBox,_that.brand,_that.model,_that.colors,_that.materials,_that.condition,_that.estimatedValue,_that.description);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int boxIndex,  String label,  String category,  double confidence,  BoundingBox boundingBox,  String? brand,  String? model,  List<String> colors,  List<String> materials,  String? condition,  ValueRange? estimatedValue,  String? description)  $default,) {final _that = this;
switch (_that) {
case _DetectedObject():
return $default(_that.boxIndex,_that.label,_that.category,_that.confidence,_that.boundingBox,_that.brand,_that.model,_that.colors,_that.materials,_that.condition,_that.estimatedValue,_that.description);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int boxIndex,  String label,  String category,  double confidence,  BoundingBox boundingBox,  String? brand,  String? model,  List<String> colors,  List<String> materials,  String? condition,  ValueRange? estimatedValue,  String? description)?  $default,) {final _that = this;
switch (_that) {
case _DetectedObject() when $default != null:
return $default(_that.boxIndex,_that.label,_that.category,_that.confidence,_that.boundingBox,_that.brand,_that.model,_that.colors,_that.materials,_that.condition,_that.estimatedValue,_that.description);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DetectedObject implements DetectedObject {
  const _DetectedObject({required this.boxIndex, required this.label, required this.category, required this.confidence, required this.boundingBox, this.brand, this.model, final  List<String> colors = const [], final  List<String> materials = const [], this.condition, this.estimatedValue, this.description}): _colors = colors,_materials = materials;
  factory _DetectedObject.fromJson(Map<String, dynamic> json) => _$DetectedObjectFromJson(json);

@override final  int boxIndex;
@override final  String label;
@override final  String category;
@override final  double confidence;
@override final  BoundingBox boundingBox;
@override final  String? brand;
@override final  String? model;
 final  List<String> _colors;
@override@JsonKey() List<String> get colors {
  if (_colors is EqualUnmodifiableListView) return _colors;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_colors);
}

 final  List<String> _materials;
@override@JsonKey() List<String> get materials {
  if (_materials is EqualUnmodifiableListView) return _materials;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_materials);
}

@override final  String? condition;
@override final  ValueRange? estimatedValue;
@override final  String? description;

/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DetectedObjectCopyWith<_DetectedObject> get copyWith => __$DetectedObjectCopyWithImpl<_DetectedObject>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DetectedObjectToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DetectedObject&&(identical(other.boxIndex, boxIndex) || other.boxIndex == boxIndex)&&(identical(other.label, label) || other.label == label)&&(identical(other.category, category) || other.category == category)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.boundingBox, boundingBox) || other.boundingBox == boundingBox)&&(identical(other.brand, brand) || other.brand == brand)&&(identical(other.model, model) || other.model == model)&&const DeepCollectionEquality().equals(other._colors, _colors)&&const DeepCollectionEquality().equals(other._materials, _materials)&&(identical(other.condition, condition) || other.condition == condition)&&(identical(other.estimatedValue, estimatedValue) || other.estimatedValue == estimatedValue)&&(identical(other.description, description) || other.description == description));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,boxIndex,label,category,confidence,boundingBox,brand,model,const DeepCollectionEquality().hash(_colors),const DeepCollectionEquality().hash(_materials),condition,estimatedValue,description);

@override
String toString() {
  return 'DetectedObject(boxIndex: $boxIndex, label: $label, category: $category, confidence: $confidence, boundingBox: $boundingBox, brand: $brand, model: $model, colors: $colors, materials: $materials, condition: $condition, estimatedValue: $estimatedValue, description: $description)';
}


}

/// @nodoc
abstract mixin class _$DetectedObjectCopyWith<$Res> implements $DetectedObjectCopyWith<$Res> {
  factory _$DetectedObjectCopyWith(_DetectedObject value, $Res Function(_DetectedObject) _then) = __$DetectedObjectCopyWithImpl;
@override @useResult
$Res call({
 int boxIndex, String label, String category, double confidence, BoundingBox boundingBox, String? brand, String? model, List<String> colors, List<String> materials, String? condition, ValueRange? estimatedValue, String? description
});


@override $BoundingBoxCopyWith<$Res> get boundingBox;@override $ValueRangeCopyWith<$Res>? get estimatedValue;

}
/// @nodoc
class __$DetectedObjectCopyWithImpl<$Res>
    implements _$DetectedObjectCopyWith<$Res> {
  __$DetectedObjectCopyWithImpl(this._self, this._then);

  final _DetectedObject _self;
  final $Res Function(_DetectedObject) _then;

/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? boxIndex = null,Object? label = null,Object? category = null,Object? confidence = null,Object? boundingBox = null,Object? brand = freezed,Object? model = freezed,Object? colors = null,Object? materials = null,Object? condition = freezed,Object? estimatedValue = freezed,Object? description = freezed,}) {
  return _then(_DetectedObject(
boxIndex: null == boxIndex ? _self.boxIndex : boxIndex // ignore: cast_nullable_to_non_nullable
as int,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,category: null == category ? _self.category : category // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,boundingBox: null == boundingBox ? _self.boundingBox : boundingBox // ignore: cast_nullable_to_non_nullable
as BoundingBox,brand: freezed == brand ? _self.brand : brand // ignore: cast_nullable_to_non_nullable
as String?,model: freezed == model ? _self.model : model // ignore: cast_nullable_to_non_nullable
as String?,colors: null == colors ? _self._colors : colors // ignore: cast_nullable_to_non_nullable
as List<String>,materials: null == materials ? _self._materials : materials // ignore: cast_nullable_to_non_nullable
as List<String>,condition: freezed == condition ? _self.condition : condition // ignore: cast_nullable_to_non_nullable
as String?,estimatedValue: freezed == estimatedValue ? _self.estimatedValue : estimatedValue // ignore: cast_nullable_to_non_nullable
as ValueRange?,description: freezed == description ? _self.description : description // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get boundingBox {
  
  return $BoundingBoxCopyWith<$Res>(_self.boundingBox, (value) {
    return _then(_self.copyWith(boundingBox: value));
  });
}/// Create a copy of DetectedObject
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$ValueRangeCopyWith<$Res>? get estimatedValue {
    if (_self.estimatedValue == null) {
    return null;
  }

  return $ValueRangeCopyWith<$Res>(_self.estimatedValue!, (value) {
    return _then(_self.copyWith(estimatedValue: value));
  });
}
}


/// @nodoc
mixin _$BoundingBox {

 double get x; double get y; double get width; double get height;
/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<BoundingBox> get copyWith => _$BoundingBoxCopyWithImpl<BoundingBox>(this as BoundingBox, _$identity);

  /// Serializes this BoundingBox to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is BoundingBox&&(identical(other.x, x) || other.x == x)&&(identical(other.y, y) || other.y == y)&&(identical(other.width, width) || other.width == width)&&(identical(other.height, height) || other.height == height));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,x,y,width,height);

@override
String toString() {
  return 'BoundingBox(x: $x, y: $y, width: $width, height: $height)';
}


}

/// @nodoc
abstract mixin class $BoundingBoxCopyWith<$Res>  {
  factory $BoundingBoxCopyWith(BoundingBox value, $Res Function(BoundingBox) _then) = _$BoundingBoxCopyWithImpl;
@useResult
$Res call({
 double x, double y, double width, double height
});




}
/// @nodoc
class _$BoundingBoxCopyWithImpl<$Res>
    implements $BoundingBoxCopyWith<$Res> {
  _$BoundingBoxCopyWithImpl(this._self, this._then);

  final BoundingBox _self;
  final $Res Function(BoundingBox) _then;

/// Create a copy of BoundingBox
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


/// Adds pattern-matching-related methods to [BoundingBox].
extension BoundingBoxPatterns on BoundingBox {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _BoundingBox value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _BoundingBox() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _BoundingBox value)  $default,){
final _that = this;
switch (_that) {
case _BoundingBox():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _BoundingBox value)?  $default,){
final _that = this;
switch (_that) {
case _BoundingBox() when $default != null:
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
case _BoundingBox() when $default != null:
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
case _BoundingBox():
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
case _BoundingBox() when $default != null:
return $default(_that.x,_that.y,_that.width,_that.height);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _BoundingBox implements BoundingBox {
  const _BoundingBox({required this.x, required this.y, required this.width, required this.height});
  factory _BoundingBox.fromJson(Map<String, dynamic> json) => _$BoundingBoxFromJson(json);

@override final  double x;
@override final  double y;
@override final  double width;
@override final  double height;

/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$BoundingBoxCopyWith<_BoundingBox> get copyWith => __$BoundingBoxCopyWithImpl<_BoundingBox>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$BoundingBoxToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _BoundingBox&&(identical(other.x, x) || other.x == x)&&(identical(other.y, y) || other.y == y)&&(identical(other.width, width) || other.width == width)&&(identical(other.height, height) || other.height == height));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,x,y,width,height);

@override
String toString() {
  return 'BoundingBox(x: $x, y: $y, width: $width, height: $height)';
}


}

/// @nodoc
abstract mixin class _$BoundingBoxCopyWith<$Res> implements $BoundingBoxCopyWith<$Res> {
  factory _$BoundingBoxCopyWith(_BoundingBox value, $Res Function(_BoundingBox) _then) = __$BoundingBoxCopyWithImpl;
@override @useResult
$Res call({
 double x, double y, double width, double height
});




}
/// @nodoc
class __$BoundingBoxCopyWithImpl<$Res>
    implements _$BoundingBoxCopyWith<$Res> {
  __$BoundingBoxCopyWithImpl(this._self, this._then);

  final _BoundingBox _self;
  final $Res Function(_BoundingBox) _then;

/// Create a copy of BoundingBox
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? x = null,Object? y = null,Object? width = null,Object? height = null,}) {
  return _then(_BoundingBox(
x: null == x ? _self.x : x // ignore: cast_nullable_to_non_nullable
as double,y: null == y ? _self.y : y // ignore: cast_nullable_to_non_nullable
as double,width: null == width ? _self.width : width // ignore: cast_nullable_to_non_nullable
as double,height: null == height ? _self.height : height // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}


/// @nodoc
mixin _$ValueRange {

 double get low; double get high;
/// Create a copy of ValueRange
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ValueRangeCopyWith<ValueRange> get copyWith => _$ValueRangeCopyWithImpl<ValueRange>(this as ValueRange, _$identity);

  /// Serializes this ValueRange to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ValueRange&&(identical(other.low, low) || other.low == low)&&(identical(other.high, high) || other.high == high));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,low,high);

@override
String toString() {
  return 'ValueRange(low: $low, high: $high)';
}


}

/// @nodoc
abstract mixin class $ValueRangeCopyWith<$Res>  {
  factory $ValueRangeCopyWith(ValueRange value, $Res Function(ValueRange) _then) = _$ValueRangeCopyWithImpl;
@useResult
$Res call({
 double low, double high
});




}
/// @nodoc
class _$ValueRangeCopyWithImpl<$Res>
    implements $ValueRangeCopyWith<$Res> {
  _$ValueRangeCopyWithImpl(this._self, this._then);

  final ValueRange _self;
  final $Res Function(ValueRange) _then;

/// Create a copy of ValueRange
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? low = null,Object? high = null,}) {
  return _then(_self.copyWith(
low: null == low ? _self.low : low // ignore: cast_nullable_to_non_nullable
as double,high: null == high ? _self.high : high // ignore: cast_nullable_to_non_nullable
as double,
  ));
}

}


/// Adds pattern-matching-related methods to [ValueRange].
extension ValueRangePatterns on ValueRange {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ValueRange value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ValueRange() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ValueRange value)  $default,){
final _that = this;
switch (_that) {
case _ValueRange():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ValueRange value)?  $default,){
final _that = this;
switch (_that) {
case _ValueRange() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( double low,  double high)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ValueRange() when $default != null:
return $default(_that.low,_that.high);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( double low,  double high)  $default,) {final _that = this;
switch (_that) {
case _ValueRange():
return $default(_that.low,_that.high);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( double low,  double high)?  $default,) {final _that = this;
switch (_that) {
case _ValueRange() when $default != null:
return $default(_that.low,_that.high);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _ValueRange implements ValueRange {
  const _ValueRange({required this.low, required this.high});
  factory _ValueRange.fromJson(Map<String, dynamic> json) => _$ValueRangeFromJson(json);

@override final  double low;
@override final  double high;

/// Create a copy of ValueRange
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ValueRangeCopyWith<_ValueRange> get copyWith => __$ValueRangeCopyWithImpl<_ValueRange>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ValueRangeToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ValueRange&&(identical(other.low, low) || other.low == low)&&(identical(other.high, high) || other.high == high));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,low,high);

@override
String toString() {
  return 'ValueRange(low: $low, high: $high)';
}


}

/// @nodoc
abstract mixin class _$ValueRangeCopyWith<$Res> implements $ValueRangeCopyWith<$Res> {
  factory _$ValueRangeCopyWith(_ValueRange value, $Res Function(_ValueRange) _then) = __$ValueRangeCopyWithImpl;
@override @useResult
$Res call({
 double low, double high
});




}
/// @nodoc
class __$ValueRangeCopyWithImpl<$Res>
    implements _$ValueRangeCopyWith<$Res> {
  __$ValueRangeCopyWithImpl(this._self, this._then);

  final _ValueRange _self;
  final $Res Function(_ValueRange) _then;

/// Create a copy of ValueRange
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? low = null,Object? high = null,}) {
  return _then(_ValueRange(
low: null == low ? _self.low : low // ignore: cast_nullable_to_non_nullable
as double,high: null == high ? _self.high : high // ignore: cast_nullable_to_non_nullable
as double,
  ));
}


}

// dart format on
