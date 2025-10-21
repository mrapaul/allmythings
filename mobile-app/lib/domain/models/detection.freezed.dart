// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'detection.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

Detection _$DetectionFromJson(Map<String, dynamic> json) {
  return _Detection.fromJson(json);
}

/// @nodoc
mixin _$Detection {
  /// Unique identifier for this detection
  String get id => throw _privateConstructorUsedError;

  /// Primary label (after ensemble consensus)
  String get label => throw _privateConstructorUsedError;

  /// Final confidence score (after ensemble fusion)
  double get confidence => throw _privateConstructorUsedError;

  /// Bounding box coordinates
  BoundingBox get boundingBox => throw _privateConstructorUsedError;

  /// Ensemble voting details
  EnsembleDetails get ensembleDetails => throw _privateConstructorUsedError;

  /// Alternative labels from providers
  List<AlternativeLabel> get alternativeLabels =>
      throw _privateConstructorUsedError;

  /// Serializes this Detection to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $DetectionCopyWith<Detection> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $DetectionCopyWith<$Res> {
  factory $DetectionCopyWith(Detection value, $Res Function(Detection) then) =
      _$DetectionCopyWithImpl<$Res, Detection>;
  @useResult
  $Res call(
      {String id,
      String label,
      double confidence,
      BoundingBox boundingBox,
      EnsembleDetails ensembleDetails,
      List<AlternativeLabel> alternativeLabels});

  $BoundingBoxCopyWith<$Res> get boundingBox;
  $EnsembleDetailsCopyWith<$Res> get ensembleDetails;
}

/// @nodoc
class _$DetectionCopyWithImpl<$Res, $Val extends Detection>
    implements $DetectionCopyWith<$Res> {
  _$DetectionCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? label = null,
    Object? confidence = null,
    Object? boundingBox = null,
    Object? ensembleDetails = null,
    Object? alternativeLabels = null,
  }) {
    return _then(_value.copyWith(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      label: null == label
          ? _value.label
          : label // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      boundingBox: null == boundingBox
          ? _value.boundingBox
          : boundingBox // ignore: cast_nullable_to_non_nullable
              as BoundingBox,
      ensembleDetails: null == ensembleDetails
          ? _value.ensembleDetails
          : ensembleDetails // ignore: cast_nullable_to_non_nullable
              as EnsembleDetails,
      alternativeLabels: null == alternativeLabels
          ? _value.alternativeLabels
          : alternativeLabels // ignore: cast_nullable_to_non_nullable
              as List<AlternativeLabel>,
    ) as $Val);
  }

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $BoundingBoxCopyWith<$Res> get boundingBox {
    return $BoundingBoxCopyWith<$Res>(_value.boundingBox, (value) {
      return _then(_value.copyWith(boundingBox: value) as $Val);
    });
  }

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @override
  @pragma('vm:prefer-inline')
  $EnsembleDetailsCopyWith<$Res> get ensembleDetails {
    return $EnsembleDetailsCopyWith<$Res>(_value.ensembleDetails, (value) {
      return _then(_value.copyWith(ensembleDetails: value) as $Val);
    });
  }
}

/// @nodoc
abstract class _$$DetectionImplCopyWith<$Res>
    implements $DetectionCopyWith<$Res> {
  factory _$$DetectionImplCopyWith(
          _$DetectionImpl value, $Res Function(_$DetectionImpl) then) =
      __$$DetectionImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {String id,
      String label,
      double confidence,
      BoundingBox boundingBox,
      EnsembleDetails ensembleDetails,
      List<AlternativeLabel> alternativeLabels});

  @override
  $BoundingBoxCopyWith<$Res> get boundingBox;
  @override
  $EnsembleDetailsCopyWith<$Res> get ensembleDetails;
}

/// @nodoc
class __$$DetectionImplCopyWithImpl<$Res>
    extends _$DetectionCopyWithImpl<$Res, _$DetectionImpl>
    implements _$$DetectionImplCopyWith<$Res> {
  __$$DetectionImplCopyWithImpl(
      _$DetectionImpl _value, $Res Function(_$DetectionImpl) _then)
      : super(_value, _then);

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? id = null,
    Object? label = null,
    Object? confidence = null,
    Object? boundingBox = null,
    Object? ensembleDetails = null,
    Object? alternativeLabels = null,
  }) {
    return _then(_$DetectionImpl(
      id: null == id
          ? _value.id
          : id // ignore: cast_nullable_to_non_nullable
              as String,
      label: null == label
          ? _value.label
          : label // ignore: cast_nullable_to_non_nullable
              as String,
      confidence: null == confidence
          ? _value.confidence
          : confidence // ignore: cast_nullable_to_non_nullable
              as double,
      boundingBox: null == boundingBox
          ? _value.boundingBox
          : boundingBox // ignore: cast_nullable_to_non_nullable
              as BoundingBox,
      ensembleDetails: null == ensembleDetails
          ? _value.ensembleDetails
          : ensembleDetails // ignore: cast_nullable_to_non_nullable
              as EnsembleDetails,
      alternativeLabels: null == alternativeLabels
          ? _value._alternativeLabels
          : alternativeLabels // ignore: cast_nullable_to_non_nullable
              as List<AlternativeLabel>,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$DetectionImpl implements _Detection {
  const _$DetectionImpl(
      {required this.id,
      required this.label,
      required this.confidence,
      required this.boundingBox,
      required this.ensembleDetails,
      required final List<AlternativeLabel> alternativeLabels})
      : _alternativeLabels = alternativeLabels;

  factory _$DetectionImpl.fromJson(Map<String, dynamic> json) =>
      _$$DetectionImplFromJson(json);

  /// Unique identifier for this detection
  @override
  final String id;

  /// Primary label (after ensemble consensus)
  @override
  final String label;

  /// Final confidence score (after ensemble fusion)
  @override
  final double confidence;

  /// Bounding box coordinates
  @override
  final BoundingBox boundingBox;

  /// Ensemble voting details
  @override
  final EnsembleDetails ensembleDetails;

  /// Alternative labels from providers
  final List<AlternativeLabel> _alternativeLabels;

  /// Alternative labels from providers
  @override
  List<AlternativeLabel> get alternativeLabels {
    if (_alternativeLabels is EqualUnmodifiableListView)
      return _alternativeLabels;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_alternativeLabels);
  }

  @override
  String toString() {
    return 'Detection(id: $id, label: $label, confidence: $confidence, boundingBox: $boundingBox, ensembleDetails: $ensembleDetails, alternativeLabels: $alternativeLabels)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$DetectionImpl &&
            (identical(other.id, id) || other.id == id) &&
            (identical(other.label, label) || other.label == label) &&
            (identical(other.confidence, confidence) ||
                other.confidence == confidence) &&
            (identical(other.boundingBox, boundingBox) ||
                other.boundingBox == boundingBox) &&
            (identical(other.ensembleDetails, ensembleDetails) ||
                other.ensembleDetails == ensembleDetails) &&
            const DeepCollectionEquality()
                .equals(other._alternativeLabels, _alternativeLabels));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      id,
      label,
      confidence,
      boundingBox,
      ensembleDetails,
      const DeepCollectionEquality().hash(_alternativeLabels));

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$DetectionImplCopyWith<_$DetectionImpl> get copyWith =>
      __$$DetectionImplCopyWithImpl<_$DetectionImpl>(this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$DetectionImplToJson(
      this,
    );
  }
}

abstract class _Detection implements Detection {
  const factory _Detection(
          {required final String id,
          required final String label,
          required final double confidence,
          required final BoundingBox boundingBox,
          required final EnsembleDetails ensembleDetails,
          required final List<AlternativeLabel> alternativeLabels}) =
      _$DetectionImpl;

  factory _Detection.fromJson(Map<String, dynamic> json) =
      _$DetectionImpl.fromJson;

  /// Unique identifier for this detection
  @override
  String get id;

  /// Primary label (after ensemble consensus)
  @override
  String get label;

  /// Final confidence score (after ensemble fusion)
  @override
  double get confidence;

  /// Bounding box coordinates
  @override
  BoundingBox get boundingBox;

  /// Ensemble voting details
  @override
  EnsembleDetails get ensembleDetails;

  /// Alternative labels from providers
  @override
  List<AlternativeLabel> get alternativeLabels;

  /// Create a copy of Detection
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$DetectionImplCopyWith<_$DetectionImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
