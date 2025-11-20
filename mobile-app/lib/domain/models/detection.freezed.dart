// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'detection.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Detection {

 String get label; double get confidence; BoundingBox get boundingBox; EnsembleDetails get ensembleDetails; List<AlternativeLabel> get alternativeLabels; String? get id; DateTime? get createdAt; DateTime? get updatedAt;
/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DetectionCopyWith<Detection> get copyWith => _$DetectionCopyWithImpl<Detection>(this as Detection, _$identity);

  /// Serializes this Detection to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Detection&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.boundingBox, boundingBox) || other.boundingBox == boundingBox)&&(identical(other.ensembleDetails, ensembleDetails) || other.ensembleDetails == ensembleDetails)&&const DeepCollectionEquality().equals(other.alternativeLabels, alternativeLabels)&&(identical(other.id, id) || other.id == id)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,confidence,boundingBox,ensembleDetails,const DeepCollectionEquality().hash(alternativeLabels),id,createdAt,updatedAt);

@override
String toString() {
  return 'Detection(label: $label, confidence: $confidence, boundingBox: $boundingBox, ensembleDetails: $ensembleDetails, alternativeLabels: $alternativeLabels, id: $id, createdAt: $createdAt, updatedAt: $updatedAt)';
}


}

/// @nodoc
abstract mixin class $DetectionCopyWith<$Res>  {
  factory $DetectionCopyWith(Detection value, $Res Function(Detection) _then) = _$DetectionCopyWithImpl;
@useResult
$Res call({
 String label, double confidence, BoundingBox boundingBox, EnsembleDetails ensembleDetails, List<AlternativeLabel> alternativeLabels, String? id, DateTime? createdAt, DateTime? updatedAt
});


$BoundingBoxCopyWith<$Res> get boundingBox;$EnsembleDetailsCopyWith<$Res> get ensembleDetails;

}
/// @nodoc
class _$DetectionCopyWithImpl<$Res>
    implements $DetectionCopyWith<$Res> {
  _$DetectionCopyWithImpl(this._self, this._then);

  final Detection _self;
  final $Res Function(Detection) _then;

/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? label = null,Object? confidence = null,Object? boundingBox = null,Object? ensembleDetails = null,Object? alternativeLabels = null,Object? id = freezed,Object? createdAt = freezed,Object? updatedAt = freezed,}) {
  return _then(_self.copyWith(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,boundingBox: null == boundingBox ? _self.boundingBox : boundingBox // ignore: cast_nullable_to_non_nullable
as BoundingBox,ensembleDetails: null == ensembleDetails ? _self.ensembleDetails : ensembleDetails // ignore: cast_nullable_to_non_nullable
as EnsembleDetails,alternativeLabels: null == alternativeLabels ? _self.alternativeLabels : alternativeLabels // ignore: cast_nullable_to_non_nullable
as List<AlternativeLabel>,id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,updatedAt: freezed == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}
/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get boundingBox {
  
  return $BoundingBoxCopyWith<$Res>(_self.boundingBox, (value) {
    return _then(_self.copyWith(boundingBox: value));
  });
}/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EnsembleDetailsCopyWith<$Res> get ensembleDetails {
  
  return $EnsembleDetailsCopyWith<$Res>(_self.ensembleDetails, (value) {
    return _then(_self.copyWith(ensembleDetails: value));
  });
}
}


/// Adds pattern-matching-related methods to [Detection].
extension DetectionPatterns on Detection {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Detection value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Detection() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Detection value)  $default,){
final _that = this;
switch (_that) {
case _Detection():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Detection value)?  $default,){
final _that = this;
switch (_that) {
case _Detection() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String label,  double confidence,  BoundingBox boundingBox,  EnsembleDetails ensembleDetails,  List<AlternativeLabel> alternativeLabels,  String? id,  DateTime? createdAt,  DateTime? updatedAt)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Detection() when $default != null:
return $default(_that.label,_that.confidence,_that.boundingBox,_that.ensembleDetails,_that.alternativeLabels,_that.id,_that.createdAt,_that.updatedAt);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String label,  double confidence,  BoundingBox boundingBox,  EnsembleDetails ensembleDetails,  List<AlternativeLabel> alternativeLabels,  String? id,  DateTime? createdAt,  DateTime? updatedAt)  $default,) {final _that = this;
switch (_that) {
case _Detection():
return $default(_that.label,_that.confidence,_that.boundingBox,_that.ensembleDetails,_that.alternativeLabels,_that.id,_that.createdAt,_that.updatedAt);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String label,  double confidence,  BoundingBox boundingBox,  EnsembleDetails ensembleDetails,  List<AlternativeLabel> alternativeLabels,  String? id,  DateTime? createdAt,  DateTime? updatedAt)?  $default,) {final _that = this;
switch (_that) {
case _Detection() when $default != null:
return $default(_that.label,_that.confidence,_that.boundingBox,_that.ensembleDetails,_that.alternativeLabels,_that.id,_that.createdAt,_that.updatedAt);case _:
  return null;

}
}

}

/// @nodoc

@JsonSerializable(explicitToJson: true)
class _Detection extends Detection {
  const _Detection({required this.label, required this.confidence, required this.boundingBox, required this.ensembleDetails, required final  List<AlternativeLabel> alternativeLabels, this.id, this.createdAt, this.updatedAt}): _alternativeLabels = alternativeLabels,super._();
  factory _Detection.fromJson(Map<String, dynamic> json) => _$DetectionFromJson(json);

@override final  String label;
@override final  double confidence;
@override final  BoundingBox boundingBox;
@override final  EnsembleDetails ensembleDetails;
 final  List<AlternativeLabel> _alternativeLabels;
@override List<AlternativeLabel> get alternativeLabels {
  if (_alternativeLabels is EqualUnmodifiableListView) return _alternativeLabels;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alternativeLabels);
}

@override final  String? id;
@override final  DateTime? createdAt;
@override final  DateTime? updatedAt;

/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DetectionCopyWith<_Detection> get copyWith => __$DetectionCopyWithImpl<_Detection>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DetectionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Detection&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.boundingBox, boundingBox) || other.boundingBox == boundingBox)&&(identical(other.ensembleDetails, ensembleDetails) || other.ensembleDetails == ensembleDetails)&&const DeepCollectionEquality().equals(other._alternativeLabels, _alternativeLabels)&&(identical(other.id, id) || other.id == id)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.updatedAt, updatedAt) || other.updatedAt == updatedAt));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,label,confidence,boundingBox,ensembleDetails,const DeepCollectionEquality().hash(_alternativeLabels),id,createdAt,updatedAt);

@override
String toString() {
  return 'Detection(label: $label, confidence: $confidence, boundingBox: $boundingBox, ensembleDetails: $ensembleDetails, alternativeLabels: $alternativeLabels, id: $id, createdAt: $createdAt, updatedAt: $updatedAt)';
}


}

/// @nodoc
abstract mixin class _$DetectionCopyWith<$Res> implements $DetectionCopyWith<$Res> {
  factory _$DetectionCopyWith(_Detection value, $Res Function(_Detection) _then) = __$DetectionCopyWithImpl;
@override @useResult
$Res call({
 String label, double confidence, BoundingBox boundingBox, EnsembleDetails ensembleDetails, List<AlternativeLabel> alternativeLabels, String? id, DateTime? createdAt, DateTime? updatedAt
});


@override $BoundingBoxCopyWith<$Res> get boundingBox;@override $EnsembleDetailsCopyWith<$Res> get ensembleDetails;

}
/// @nodoc
class __$DetectionCopyWithImpl<$Res>
    implements _$DetectionCopyWith<$Res> {
  __$DetectionCopyWithImpl(this._self, this._then);

  final _Detection _self;
  final $Res Function(_Detection) _then;

/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? label = null,Object? confidence = null,Object? boundingBox = null,Object? ensembleDetails = null,Object? alternativeLabels = null,Object? id = freezed,Object? createdAt = freezed,Object? updatedAt = freezed,}) {
  return _then(_Detection(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,boundingBox: null == boundingBox ? _self.boundingBox : boundingBox // ignore: cast_nullable_to_non_nullable
as BoundingBox,ensembleDetails: null == ensembleDetails ? _self.ensembleDetails : ensembleDetails // ignore: cast_nullable_to_non_nullable
as EnsembleDetails,alternativeLabels: null == alternativeLabels ? _self._alternativeLabels : alternativeLabels // ignore: cast_nullable_to_non_nullable
as List<AlternativeLabel>,id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,createdAt: freezed == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime?,updatedAt: freezed == updatedAt ? _self.updatedAt : updatedAt // ignore: cast_nullable_to_non_nullable
as DateTime?,
  ));
}

/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$BoundingBoxCopyWith<$Res> get boundingBox {
  
  return $BoundingBoxCopyWith<$Res>(_self.boundingBox, (value) {
    return _then(_self.copyWith(boundingBox: value));
  });
}/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$EnsembleDetailsCopyWith<$Res> get ensembleDetails {
  
  return $EnsembleDetailsCopyWith<$Res>(_self.ensembleDetails, (value) {
    return _then(_self.copyWith(ensembleDetails: value));
  });
}
}

// dart format on
