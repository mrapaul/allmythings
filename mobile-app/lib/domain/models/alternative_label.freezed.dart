// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'alternative_label.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$AlternativeLabel implements DiagnosticableTreeMixin {

 String get label; double get confidence; VisionProvider get provider;
/// Create a copy of AlternativeLabel
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$AlternativeLabelCopyWith<AlternativeLabel> get copyWith => _$AlternativeLabelCopyWithImpl<AlternativeLabel>(this as AlternativeLabel, _$identity);


@override
void debugFillProperties(DiagnosticPropertiesBuilder properties) {
  properties
    ..add(DiagnosticsProperty('type', 'AlternativeLabel'))
    ..add(DiagnosticsProperty('label', label))..add(DiagnosticsProperty('confidence', confidence))..add(DiagnosticsProperty('provider', provider));
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is AlternativeLabel&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&const DeepCollectionEquality().equals(other.provider, provider));
}


@override
int get hashCode => Object.hash(runtimeType,label,confidence,const DeepCollectionEquality().hash(provider));

@override
String toString({ DiagnosticLevel minLevel = DiagnosticLevel.info }) {
  return 'AlternativeLabel(label: $label, confidence: $confidence, provider: $provider)';
}


}

/// @nodoc
abstract mixin class $AlternativeLabelCopyWith<$Res>  {
  factory $AlternativeLabelCopyWith(AlternativeLabel value, $Res Function(AlternativeLabel) _then) = _$AlternativeLabelCopyWithImpl;
@useResult
$Res call({
 String label, double confidence, VisionProvider provider
});




}
/// @nodoc
class _$AlternativeLabelCopyWithImpl<$Res>
    implements $AlternativeLabelCopyWith<$Res> {
  _$AlternativeLabelCopyWithImpl(this._self, this._then);

  final AlternativeLabel _self;
  final $Res Function(AlternativeLabel) _then;

/// Create a copy of AlternativeLabel
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? label = null,Object? confidence = null,Object? provider = freezed,}) {
  return _then(_self.copyWith(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,provider: freezed == provider ? _self.provider : provider // ignore: cast_nullable_to_non_nullable
as VisionProvider,
  ));
}

}


/// Adds pattern-matching-related methods to [AlternativeLabel].
extension AlternativeLabelPatterns on AlternativeLabel {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _AlternativeLabel value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _AlternativeLabel() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _AlternativeLabel value)  $default,){
final _that = this;
switch (_that) {
case _AlternativeLabel():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _AlternativeLabel value)?  $default,){
final _that = this;
switch (_that) {
case _AlternativeLabel() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String label,  double confidence,  VisionProvider provider)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _AlternativeLabel() when $default != null:
return $default(_that.label,_that.confidence,_that.provider);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String label,  double confidence,  VisionProvider provider)  $default,) {final _that = this;
switch (_that) {
case _AlternativeLabel():
return $default(_that.label,_that.confidence,_that.provider);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String label,  double confidence,  VisionProvider provider)?  $default,) {final _that = this;
switch (_that) {
case _AlternativeLabel() when $default != null:
return $default(_that.label,_that.confidence,_that.provider);case _:
  return null;

}
}

}

/// @nodoc


class _AlternativeLabel with DiagnosticableTreeMixin implements AlternativeLabel {
  const _AlternativeLabel({required this.label, required this.confidence, required this.provider});
  

@override final  String label;
@override final  double confidence;
@override final  VisionProvider provider;

/// Create a copy of AlternativeLabel
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$AlternativeLabelCopyWith<_AlternativeLabel> get copyWith => __$AlternativeLabelCopyWithImpl<_AlternativeLabel>(this, _$identity);


@override
void debugFillProperties(DiagnosticPropertiesBuilder properties) {
  properties
    ..add(DiagnosticsProperty('type', 'AlternativeLabel'))
    ..add(DiagnosticsProperty('label', label))..add(DiagnosticsProperty('confidence', confidence))..add(DiagnosticsProperty('provider', provider));
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _AlternativeLabel&&(identical(other.label, label) || other.label == label)&&(identical(other.confidence, confidence) || other.confidence == confidence)&&const DeepCollectionEquality().equals(other.provider, provider));
}


@override
int get hashCode => Object.hash(runtimeType,label,confidence,const DeepCollectionEquality().hash(provider));

@override
String toString({ DiagnosticLevel minLevel = DiagnosticLevel.info }) {
  return 'AlternativeLabel(label: $label, confidence: $confidence, provider: $provider)';
}


}

/// @nodoc
abstract mixin class _$AlternativeLabelCopyWith<$Res> implements $AlternativeLabelCopyWith<$Res> {
  factory _$AlternativeLabelCopyWith(_AlternativeLabel value, $Res Function(_AlternativeLabel) _then) = __$AlternativeLabelCopyWithImpl;
@override @useResult
$Res call({
 String label, double confidence, VisionProvider provider
});




}
/// @nodoc
class __$AlternativeLabelCopyWithImpl<$Res>
    implements _$AlternativeLabelCopyWith<$Res> {
  __$AlternativeLabelCopyWithImpl(this._self, this._then);

  final _AlternativeLabel _self;
  final $Res Function(_AlternativeLabel) _then;

/// Create a copy of AlternativeLabel
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? label = null,Object? confidence = null,Object? provider = freezed,}) {
  return _then(_AlternativeLabel(
label: null == label ? _self.label : label // ignore: cast_nullable_to_non_nullable
as String,confidence: null == confidence ? _self.confidence : confidence // ignore: cast_nullable_to_non_nullable
as double,provider: freezed == provider ? _self.provider : provider // ignore: cast_nullable_to_non_nullable
as VisionProvider,
  ));
}


}

// dart format on
