// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'alternative_label.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

AlternativeLabel _$AlternativeLabelFromJson(Map<String, dynamic> json) {
  return _AlternativeLabel.fromJson(json);
}

/// @nodoc
mixin _$AlternativeLabel {
  /// Alternative label name
  String get label => throw _privateConstructorUsedError;

  /// Confidence score for this label (0-1)
  double get confidence => throw _privateConstructorUsedError;

  /// Which provider suggested this label
  VisionProvider get provider => throw _privateConstructorUsedError;

  /// Serializes this AlternativeLabel to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of AlternativeLabel
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $AlternativeLabelCopyWith<AlternativeLabel> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $AlternativeLabelCopyWith<$Res> {
  factory $AlternativeLabelCopyWith(
          AlternativeLabel value, $Res Function(AlternativeLabel) then) =
      _$AlternativeLabelCopyWithImpl<$Res, AlternativeLabel>;
  @useResult
  $Res call({String label, double confidence, VisionProvider provider});
}

/// @nodoc
class _$AlternativeLabelCopyWithImpl<$Res, $Val extends AlternativeLabel>
    implements $AlternativeLabelCopyWith<$Res> {
  _$AlternativeLabelCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of AlternativeLabel
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? label = null,
    Object? confidence = null,
    Object? provider = null,
  }) {
    return _then(_value.copyWith(
      label: null == label
          ? _value.label
          : label // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      provider: null == provider
          ? _value.provider
          : provider // ignore: cast_nullable_to_non_nullable
              as VisionProvider,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$AlternativeLabelImplCopyWith<$Res>
    implements $AlternativeLabelCopyWith<$Res> {
  factory _$$AlternativeLabelImplCopyWith(_$AlternativeLabelImpl value,
          $Res Function(_$AlternativeLabelImpl) then) =
      __$$AlternativeLabelImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call({String label, double confidence, VisionProvider provider});
}

/// @nodoc
class __$$AlternativeLabelImplCopyWithImpl<$Res>
    extends _$AlternativeLabelCopyWithImpl<$Res, _$AlternativeLabelImpl>
    implements _$$AlternativeLabelImplCopyWith<$Res> {
  __$$AlternativeLabelImplCopyWithImpl(_$AlternativeLabelImpl _value,
      $Res Function(_$AlternativeLabelImpl) _then)
      : super(_value, _then);

  /// Create a copy of AlternativeLabel
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? label = null,
    Object? confidence = null,
    Object? provider = null,
  }) {
    return _then(_$AlternativeLabelImpl(
      label: null == label
          ? _value.label
          : label // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      provider: null == provider
          ? _value.provider
          : provider // ignore: cast_nullable_to_non_nullable
              as VisionProvider,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$AlternativeLabelImpl implements _AlternativeLabel {
  const _$AlternativeLabelImpl(
      {required this.label, required this.confidence, required this.provider});

  factory _$AlternativeLabelImpl.fromJson(Map<String, dynamic> json) =>
      _$$AlternativeLabelImplFromJson(json);

  /// Alternative label name
  @override
  final String label;

  /// Confidence score for this label (0-1)
  @override
  final double confidence;

  /// Which provider suggested this label
  @override
  final VisionProvider provider;

  @override
  String toString() {
    return 'AlternativeLabel(label: $label, confidence: $confidence, provider: $provider)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$AlternativeLabelImpl &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.confidence, confidence) ||
                other.confidence == confidence) &&
            (identical(other.provider, provider) ||
                other.provider == provider));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(runtimeType, label, confidence, provider);

  /// Create a copy of AlternativeLabel
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$AlternativeLabelImplCopyWith<_$AlternativeLabelImpl> get copyWith =>
      __$$AlternativeLabelImplCopyWithImpl<_$AlternativeLabelImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$AlternativeLabelImplToJson(
      this,
    );
  }
}

abstract class _AlternativeLabel implements AlternativeLabel {
  const factory _AlternativeLabel(
      {required final String label,
      required final double confidence,
      required final VisionProvider provider}) = _$AlternativeLabelImpl;

  factory _AlternativeLabel.fromJson(Map<String, dynamic> json) =
      _$AlternativeLabelImpl.fromJson;

  /// Alternative label name
  @override
  String get label;

  /// Confidence score for this label (0-1)
  @override
  double get confidence;

  /// Which provider suggested this label
  @override
  VisionProvider get provider;

  /// Create a copy of AlternativeLabel
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$AlternativeLabelImplCopyWith<_$AlternativeLabelImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
