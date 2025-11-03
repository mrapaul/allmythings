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
mixin _$Detection implements DiagnosticableTreeMixin {

 String? get id; String get label; double get confidence;@BoundingBoxConverter() BoundingBox get boundingBox;@EnsembleDetailsConverter() EnsembleDetails get ensembleDetails;@AlternativeLabelListConverter() List<AlternativeLabel> get alternativeLabels;
/// Create a copy of Detection
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DetectionCopyWith<Detection> get copyWith => _$DetectionCopyWithImpl<Detection>(this as Detection, _$identity);

  /// Serializes this Detection to a JSON map.
  Map<String, dynamic> toJson();

@override
void debugFillProperties(DiagnosticPropertiesBuilder properties) {
  properties
    ..add(DiagnosticsProperty('type', 'Detection'))
    ..add(DiagnosticsProperty('id', id))..add(DiagnosticsProperty('label', label))..add(DiagnosticsProperty('confidence', confidence))..add(DiagnosticsProperty('boundingBox', boundingBox))..add(DiagnosticsProperty('ensembleDetails', ensembleDetails))..add(DiagnosticsProperty('alternativeLabels', alternativeLabels));
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Detection&&(identical(other.id, id) || other.id == id)&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.boundingBox, boundingBox) || other.boundingBox == boundingBox)&&(identical(other.ensembleDetails, ensembleDetails) || other.ensembleDetails == ensembleDetails)&&const DeepCollectionEquality().equals(other.alternativeLabels, alternativeLabels));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,label,confidence,boundingBox,ensembleDetails,const DeepCollectionEquality().hash(alternativeLabels));

@override
String toString({ DiagnosticLevel minLevel = DiagnosticLevel.info }) {
  return 'Detection(id: $id, label: $label, confidence: $confidence, boundingBox: $boundingBox, ensembleDetails: $ensembleDetails, alternativeLabels: $alternativeLabels)';
}


}

/// @nodoc
abstract mixin class $DetectionCopyWith<$Res>  {
  factory $DetectionCopyWith(Detection value, $Res Function(Detection) _then) = _$DetectionCopyWithImpl;
@useResult
$Res call({
 String? id, String label, double confidence,@BoundingBoxConverter() BoundingBox boundingBox,@EnsembleDetailsConverter() EnsembleDetails ensembleDetails,@AlternativeLabelListConverter() List<AlternativeLabel> alternativeLabels
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
@pragma('vm:prefer-inline') @override $Res call({Object? id = freezed,Object? label = null,Object? confidence = null,Object? boundingBox = null,Object? ensembleDetails = null,Object? alternativeLabels = null,}) {
  return _then(_self.copyWith(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,boundingBox: null == boundingBox ? _self.boundingBox : boundingBox // ignore: cast_nullable_to_non_nullable
as BoundingBox,ensembleDetails: null == ensembleDetails ? _self.ensembleDetails : ensembleDetails // ignore: cast_nullable_to_non_nullable
as EnsembleDetails,alternativeLabels: null == alternativeLabels ? _self.alternativeLabels : alternativeLabels // ignore: cast_nullable_to_non_nullable
as List<AlternativeLabel>,
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String? id,  String label,  double confidence, @BoundingBoxConverter()  BoundingBox boundingBox, @EnsembleDetailsConverter()  EnsembleDetails ensembleDetails, @AlternativeLabelListConverter()  List<AlternativeLabel> alternativeLabels)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Detection() when $default != null:
return $default(_that.id,_that.label,_that.confidence,_that.boundingBox,_that.ensembleDetails,_that.alternativeLabels);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String? id,  String label,  double confidence, @BoundingBoxConverter()  BoundingBox boundingBox, @EnsembleDetailsConverter()  EnsembleDetails ensembleDetails, @AlternativeLabelListConverter()  List<AlternativeLabel> alternativeLabels)  $default,) {final _that = this;
switch (_that) {
case _Detection():
return $default(_that.id,_that.label,_that.confidence,_that.boundingBox,_that.ensembleDetails,_that.alternativeLabels);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String? id,  String label,  double confidence, @BoundingBoxConverter()  BoundingBox boundingBox, @EnsembleDetailsConverter()  EnsembleDetails ensembleDetails, @AlternativeLabelListConverter()  List<AlternativeLabel> alternativeLabels)?  $default,) {final _that = this;
switch (_that) {
case _Detection() when $default != null:
return $default(_that.id,_that.label,_that.confidence,_that.boundingBox,_that.ensembleDetails,_that.alternativeLabels);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Detection with DiagnosticableTreeMixin implements Detection {
  const _Detection({this.id, required this.label, required this.confidence, @BoundingBoxConverter() required this.boundingBox, @EnsembleDetailsConverter() required this.ensembleDetails, @AlternativeLabelListConverter() required final  List<AlternativeLabel> alternativeLabels}): _alternativeLabels = alternativeLabels;
  factory _Detection.fromJson(Map<String, dynamic> json) => _$DetectionFromJson(json);

@override final  String? id;
@override final  String label;
@override final  double confidence;
@override@BoundingBoxConverter() final  BoundingBox boundingBox;
@override@EnsembleDetailsConverter() final  EnsembleDetails ensembleDetails;
 final  List<AlternativeLabel> _alternativeLabels;
@override@AlternativeLabelListConverter() List<AlternativeLabel> get alternativeLabels {
  if (_alternativeLabels is EqualUnmodifiableListView) return _alternativeLabels;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alternativeLabels);
}


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
void debugFillProperties(DiagnosticPropertiesBuilder properties) {
  properties
    ..add(DiagnosticsProperty('type', 'Detection'))
    ..add(DiagnosticsProperty('id', id))..add(DiagnosticsProperty('label', label))..add(DiagnosticsProperty('confidence', confidence))..add(DiagnosticsProperty('boundingBox', boundingBox))..add(DiagnosticsProperty('ensembleDetails', ensembleDetails))..add(DiagnosticsProperty('alternativeLabels', alternativeLabels));
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Detection&&(identical(other.id, id) || other.id == id)&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&(identical(other.boundingBox, boundingBox) || other.boundingBox == boundingBox)&&(identical(other.ensembleDetails, ensembleDetails) || other.ensembleDetails == ensembleDetails)&&const DeepCollectionEquality().equals(other._alternativeLabels, _alternativeLabels));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,label,confidence,boundingBox,ensembleDetails,const DeepCollectionEquality().hash(_alternativeLabels));

@override
String toString({ DiagnosticLevel minLevel = DiagnosticLevel.info }) {
  return 'Detection(id: $id, label: $label, confidence: $confidence, boundingBox: $boundingBox, ensembleDetails: $ensembleDetails, alternativeLabels: $alternativeLabels)';
}


}

/// @nodoc
abstract mixin class _$DetectionCopyWith<$Res> implements $DetectionCopyWith<$Res> {
  factory _$DetectionCopyWith(_Detection value, $Res Function(_Detection) _then) = __$DetectionCopyWithImpl;
@override @useResult
$Res call({
 String? id, String label, double confidence,@BoundingBoxConverter() BoundingBox boundingBox,@EnsembleDetailsConverter() EnsembleDetails ensembleDetails,@AlternativeLabelListConverter() List<AlternativeLabel> alternativeLabels
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
@override @pragma('vm:prefer-inline') $Res call({Object? id = freezed,Object? label = null,Object? confidence = null,Object? boundingBox = null,Object? ensembleDetails = null,Object? alternativeLabels = null,}) {
  return _then(_Detection(
id: freezed == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String?,label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,boundingBox: null == boundingBox ? _self.boundingBox : boundingBox // ignore: cast_nullable_to_non_nullable
as BoundingBox,ensembleDetails: null == ensembleDetails ? _self.ensembleDetails : ensembleDetails // ignore: cast_nullable_to_non_nullable
as EnsembleDetails,alternativeLabels: null == alternativeLabels ? _self._alternativeLabels : alternativeLabels // ignore: cast_nullable_to_non_nullable
as List<AlternativeLabel>,
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
