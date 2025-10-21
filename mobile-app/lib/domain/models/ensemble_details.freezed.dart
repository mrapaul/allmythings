// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'ensemble_details.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

EnsembleDetails _$EnsembleDetailsFromJson(Map<String, dynamic> json) {
  return _EnsembleDetails.fromJson(json);
}

/// @nodoc
mixin _$EnsembleDetails {
  /// Number of providers that detected this object
  int get providerAgreement => throw _privateConstructorUsedError;

  /// Confidence scores from each provider
  Map<VisionProvider, double> get confidenceByProvider =>
      throw _privateConstructorUsedError;

  /// How providers agreed on the label (unanimous, majority, etc.)
  String get labelConsensus => throw _privateConstructorUsedError;

  /// Serializes this EnsembleDetails to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of EnsembleDetails
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $EnsembleDetailsCopyWith<EnsembleDetails> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $EnsembleDetailsCopyWith<$Res> {
  factory $EnsembleDetailsCopyWith(
          EnsembleDetails value, $Res Function(EnsembleDetails) then) =
      _$EnsembleDetailsCopyWithImpl<$Res, EnsembleDetails>;
  @useResult
  $Res call(
      {int providerAgreement,
      Map<VisionProvider, double> confidenceByProvider,
      String labelConsensus});
}

/// @nodoc
class _$EnsembleDetailsCopyWithImpl<$Res, $Val extends EnsembleDetails>
    implements $EnsembleDetailsCopyWith<$Res> {
  _$EnsembleDetailsCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of EnsembleDetails
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? providerAgreement = null,
    Object? confidenceByProvider = null,
    Object? labelConsensus = null,
  }) {
    return _then(_value.copyWith(
      providerAgreement: null == providerAgreement
          ? _value.providerAgreement
          : providerAgreement // ignore: cast_nullable_to_non_nullable
              as int,
      confidenceByProvider: null == confidenceByProvider
          ? _value.confidenceByProvider
          : confidenceByProvider // ignore: cast_nullable_to_non_nullable
              as Map<VisionProvider, double>,
      labelConsensus: null == labelConsensus
          ? _value.labelConsensus
          : labelConsensus // ignore: cast_nullable_to_non_nullable
              as String,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$EnsembleDetailsImplCopyWith<$Res>
    implements $EnsembleDetailsCopyWith<$Res> {
  factory _$$EnsembleDetailsImplCopyWith(_$EnsembleDetailsImpl value,
          $Res Function(_$EnsembleDetailsImpl) then) =
      __$$EnsembleDetailsImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {int providerAgreement,
      Map<VisionProvider, double> confidenceByProvider,
      String labelConsensus});
}

/// @nodoc
class __$$EnsembleDetailsImplCopyWithImpl<$Res>
    extends _$EnsembleDetailsCopyWithImpl<$Res, _$EnsembleDetailsImpl>
    implements _$$EnsembleDetailsImplCopyWith<$Res> {
  __$$EnsembleDetailsImplCopyWithImpl(
      _$EnsembleDetailsImpl _value, $Res Function(_$EnsembleDetailsImpl) _then)
      : super(_value, _then);

  /// Create a copy of EnsembleDetails
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? providerAgreement = null,
    Object? confidenceByProvider = null,
    Object? labelConsensus = null,
  }) {
    return _then(_$EnsembleDetailsImpl(
      providerAgreement: null == providerAgreement
          ? _value.providerAgreement
          : providerAgreement // ignore: cast_nullable_to_non_nullable
              as int,
      confidenceByProvider: null == confidenceByProvider
          ? _value._confidenceByProvider
          : confidenceByProvider // ignore: cast_nullable_to_non_nullable
              as Map<VisionProvider, double>,
      labelConsensus: null == labelConsensus
          ? _value.labelConsensus
          : labelConsensus // ignore: cast_nullable_to_non_nullable
              as String,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$EnsembleDetailsImpl implements _EnsembleDetails {
  const _$EnsembleDetailsImpl(
      {required this.providerAgreement,
      required final Map<VisionProvider, double> confidenceByProvider,
      required this.labelConsensus})
      : _confidenceByProvider = confidenceByProvider;

  factory _$EnsembleDetailsImpl.fromJson(Map<String, dynamic> json) =>
      _$$EnsembleDetailsImplFromJson(json);

  /// Number of providers that detected this object
  @override
  final int providerAgreement;

  /// Confidence scores from each provider
  final Map<VisionProvider, double> _confidenceByProvider;

  /// Confidence scores from each provider
  @override
  Map<VisionProvider, double> get confidenceByProvider {
    if (_confidenceByProvider is EqualUnmodifiableMapView)
      return _confidenceByProvider;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableMapView(_confidenceByProvider);
  }

  /// How providers agreed on the label (unanimous, majority, etc.)
  @override
  final String labelConsensus;

  @override
  String toString() {
    return 'EnsembleDetails(providerAgreement: $providerAgreement, confidenceByProvider: $confidenceByProvider, labelConsensus: $labelConsensus)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$EnsembleDetailsImpl &&
            (identical(other.providerAgreement, providerAgreement) ||
                other.providerAgreement == providerAgreement) &&
            const DeepCollectionEquality()
                .equals(other._confidenceByProvider, _confidenceByProvider) &&
            (identical(other.labelConsensus, labelConsensus) ||
                other.labelConsensus == labelConsensus));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      providerAgreement,
      const DeepCollectionEquality().hash(_confidenceByProvider),
      labelConsensus);

  /// Create a copy of EnsembleDetails
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$EnsembleDetailsImplCopyWith<_$EnsembleDetailsImpl> get copyWith =>
      __$$EnsembleDetailsImplCopyWithImpl<_$EnsembleDetailsImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$EnsembleDetailsImplToJson(
      this,
    );
  }
}

abstract class _EnsembleDetails implements EnsembleDetails {
  const factory _EnsembleDetails(
      {required final int providerAgreement,
      required final Map<VisionProvider, double> confidenceByProvider,
      required final String labelConsensus}) = _$EnsembleDetailsImpl;

  factory _EnsembleDetails.fromJson(Map<String, dynamic> json) =
      _$EnsembleDetailsImpl.fromJson;

  /// Number of providers that detected this object
  @override
  int get providerAgreement;

  /// Confidence scores from each provider
  @override
  Map<VisionProvider, double> get confidenceByProvider;

  /// How providers agreed on the label (unanimous, majority, etc.)
  @override
  String get labelConsensus;

  /// Create a copy of EnsembleDetails
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$EnsembleDetailsImplCopyWith<_$EnsembleDetailsImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
