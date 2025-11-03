// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ensemble_details.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$EnsembleDetails implements DiagnosticableTreeMixin {

 int get providersUsed; int get providerAgreement; String get labelConsensus; Map<VisionProvider, double> get confidenceByProvider;
/// Create a copy of EnsembleDetails
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$EnsembleDetailsCopyWith<EnsembleDetails> get copyWith => _$EnsembleDetailsCopyWithImpl<EnsembleDetails>(this as EnsembleDetails, _$identity);


@override
void debugFillProperties(DiagnosticPropertiesBuilder properties) {
  properties
    ..add(DiagnosticsProperty('type', 'EnsembleDetails'))
    ..add(DiagnosticsProperty('providersUsed', providersUsed))..add(DiagnosticsProperty('providerAgreement', providerAgreement))..add(DiagnosticsProperty('labelConsensus', labelConsensus))..add(DiagnosticsProperty('confidenceByProvider', confidenceByProvider));
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is EnsembleDetails&&(identical(other.providersUsed, providersUsed) || other.providersUsed == providersUsed)&&(identical(other.providerAgreement, providerAgreement) || other.providerAgreement == providerAgreement)&&(identical(other.labelConsensus, labelConsensus) || other.labelConsensus == labelConsensus)&&const DeepCollectionEquality().equals(other.confidenceByProvider, confidenceByProvider));
}


@override
int get hashCode => Object.hash(runtimeType,providersUsed,providerAgreement,labelConsensus,const DeepCollectionEquality().hash(confidenceByProvider));

@override
String toString({ DiagnosticLevel minLevel = DiagnosticLevel.info }) {
  return 'EnsembleDetails(providersUsed: $providersUsed, providerAgreement: $providerAgreement, labelConsensus: $labelConsensus, confidenceByProvider: $confidenceByProvider)';
}


}

/// @nodoc
abstract mixin class $EnsembleDetailsCopyWith<$Res>  {
  factory $EnsembleDetailsCopyWith(EnsembleDetails value, $Res Function(EnsembleDetails) _then) = _$EnsembleDetailsCopyWithImpl;
@useResult
$Res call({
 int providersUsed, int providerAgreement, String labelConsensus, Map<VisionProvider, double> confidenceByProvider
});




}
/// @nodoc
class _$EnsembleDetailsCopyWithImpl<$Res>
    implements $EnsembleDetailsCopyWith<$Res> {
  _$EnsembleDetailsCopyWithImpl(this._self, this._then);

  final EnsembleDetails _self;
  final $Res Function(EnsembleDetails) _then;

/// Create a copy of EnsembleDetails
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? providersUsed = null,Object? providerAgreement = null,Object? labelConsensus = null,Object? confidenceByProvider = null,}) {
  return _then(_self.copyWith(
providersUsed: null == providersUsed ? _self.providersUsed : providersUsed // ignore: cast_nullable_to_non_nullable
as int,providerAgreement: null == providerAgreement ? _self.providerAgreement : providerAgreement // ignore: cast_nullable_to_non_nullable
as int,labelConsensus: null == labelConsensus ? _self.labelConsensus : labelConsensus // ignore: cast_nullable_to_non_nullable
as String,confidenceByProvider: null == confidenceByProvider ? _self.confidenceByProvider : confidenceByProvider // ignore: cast_nullable_to_non_nullable
as Map<VisionProvider, double>,
  ));
}

}


/// Adds pattern-matching-related methods to [EnsembleDetails].
extension EnsembleDetailsPatterns on EnsembleDetails {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _EnsembleDetails value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _EnsembleDetails() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _EnsembleDetails value)  $default,){
final _that = this;
switch (_that) {
case _EnsembleDetails():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _EnsembleDetails value)?  $default,){
final _that = this;
switch (_that) {
case _EnsembleDetails() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int providersUsed,  int providerAgreement,  String labelConsensus,  Map<VisionProvider, double> confidenceByProvider)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _EnsembleDetails() when $default != null:
return $default(_that.providersUsed,_that.providerAgreement,_that.labelConsensus,_that.confidenceByProvider);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int providersUsed,  int providerAgreement,  String labelConsensus,  Map<VisionProvider, double> confidenceByProvider)  $default,) {final _that = this;
switch (_that) {
case _EnsembleDetails():
return $default(_that.providersUsed,_that.providerAgreement,_that.labelConsensus,_that.confidenceByProvider);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int providersUsed,  int providerAgreement,  String labelConsensus,  Map<VisionProvider, double> confidenceByProvider)?  $default,) {final _that = this;
switch (_that) {
case _EnsembleDetails() when $default != null:
return $default(_that.providersUsed,_that.providerAgreement,_that.labelConsensus,_that.confidenceByProvider);case _:
  return null;

}
}

}

/// @nodoc


class _EnsembleDetails with DiagnosticableTreeMixin implements EnsembleDetails {
  const _EnsembleDetails({required this.providersUsed, required this.providerAgreement, required this.labelConsensus, required final  Map<VisionProvider, double> confidenceByProvider}): _confidenceByProvider = confidenceByProvider;
  

@override final  int providersUsed;
@override final  int providerAgreement;
@override final  String labelConsensus;
 final  Map<VisionProvider, double> _confidenceByProvider;
@override Map<VisionProvider, double> get confidenceByProvider {
  if (_confidenceByProvider is EqualUnmodifiableMapView) return _confidenceByProvider;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableMapView(_confidenceByProvider);
}


/// Create a copy of EnsembleDetails
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$EnsembleDetailsCopyWith<_EnsembleDetails> get copyWith => __$EnsembleDetailsCopyWithImpl<_EnsembleDetails>(this, _$identity);


@override
void debugFillProperties(DiagnosticPropertiesBuilder properties) {
  properties
    ..add(DiagnosticsProperty('type', 'EnsembleDetails'))
    ..add(DiagnosticsProperty('providersUsed', providersUsed))..add(DiagnosticsProperty('providerAgreement', providerAgreement))..add(DiagnosticsProperty('labelConsensus', labelConsensus))..add(DiagnosticsProperty('confidenceByProvider', confidenceByProvider));
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _EnsembleDetails&&(identical(other.providersUsed, providersUsed) || other.providersUsed == providersUsed)&&(identical(other.providerAgreement, providerAgreement) || other.providerAgreement == providerAgreement)&&(identical(other.labelConsensus, labelConsensus) || other.labelConsensus == labelConsensus)&&const DeepCollectionEquality().equals(other._confidenceByProvider, _confidenceByProvider));
}


@override
int get hashCode => Object.hash(runtimeType,providersUsed,providerAgreement,labelConsensus,const DeepCollectionEquality().hash(_confidenceByProvider));

@override
String toString({ DiagnosticLevel minLevel = DiagnosticLevel.info }) {
  return 'EnsembleDetails(providersUsed: $providersUsed, providerAgreement: $providerAgreement, labelConsensus: $labelConsensus, confidenceByProvider: $confidenceByProvider)';
}


}

/// @nodoc
abstract mixin class _$EnsembleDetailsCopyWith<$Res> implements $EnsembleDetailsCopyWith<$Res> {
  factory _$EnsembleDetailsCopyWith(_EnsembleDetails value, $Res Function(_EnsembleDetails) _then) = __$EnsembleDetailsCopyWithImpl;
@override @useResult
$Res call({
 int providersUsed, int providerAgreement, String labelConsensus, Map<VisionProvider, double> confidenceByProvider
});




}
/// @nodoc
class __$EnsembleDetailsCopyWithImpl<$Res>
    implements _$EnsembleDetailsCopyWith<$Res> {
  __$EnsembleDetailsCopyWithImpl(this._self, this._then);

  final _EnsembleDetails _self;
  final $Res Function(_EnsembleDetails) _then;

/// Create a copy of EnsembleDetails
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? providersUsed = null,Object? providerAgreement = null,Object? labelConsensus = null,Object? confidenceByProvider = null,}) {
  return _then(_EnsembleDetails(
providersUsed: null == providersUsed ? _self.providersUsed : providersUsed // ignore: cast_nullable_to_non_nullable
as int,providerAgreement: null == providerAgreement ? _self.providerAgreement : providerAgreement // ignore: cast_nullable_to_non_nullable
as int,labelConsensus: null == labelConsensus ? _self.labelConsensus : labelConsensus // ignore: cast_nullable_to_non_nullable
as String,confidenceByProvider: null == confidenceByProvider ? _self._confidenceByProvider : confidenceByProvider // ignore: cast_nullable_to_non_nullable
as Map<VisionProvider, double>,
  ));
}


}

// dart format on
