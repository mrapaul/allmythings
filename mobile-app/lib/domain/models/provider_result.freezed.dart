// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'provider_result.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

T _$identity<T>(T value) => value;

final _privateConstructorUsedError = UnsupportedError(
    'It seems like you constructed your class using `MyClass._()`. This constructor is only meant to be used by freezed and you are not supposed to need it nor use it.\nPlease check the documentation here for more information: https://github.com/rrousselGit/freezed#adding-getters-and-methods-to-our-models');

ProviderResult _$ProviderResultFromJson(Map<String, dynamic> json) {
  return _ProviderResult.fromJson(json);
}

/// @nodoc
mixin _$ProviderResult {
  /// Which provider returned this result
  VisionProvider get provider => throw _privateConstructorUsedError;

  /// Whether the provider succeeded
  bool get success => throw _privateConstructorUsedError;

  /// Processing time in milliseconds
  int get processingTimeMs => throw _privateConstructorUsedError;

  /// Detections from this provider (empty if failed)
  List<Detection> get detections => throw _privateConstructorUsedError;

  /// Error message if failed
  String? get error => throw _privateConstructorUsedError;

  /// Serializes this ProviderResult to a JSON map.
  Map<String, dynamic> toJson() => throw _privateConstructorUsedError;

  /// Create a copy of ProviderResult
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  $ProviderResultCopyWith<ProviderResult> get copyWith =>
      throw _privateConstructorUsedError;
}

/// @nodoc
abstract class $ProviderResultCopyWith<$Res> {
  factory $ProviderResultCopyWith(
          ProviderResult value, $Res Function(ProviderResult) then) =
      _$ProviderResultCopyWithImpl<$Res, ProviderResult>;
  @useResult
  $Res call(
      {VisionProvider provider,
      bool success,
      int processingTimeMs,
      List<Detection> detections,
      String? error});
}

/// @nodoc
class _$ProviderResultCopyWithImpl<$Res, $Val extends ProviderResult>
    implements $ProviderResultCopyWith<$Res> {
  _$ProviderResultCopyWithImpl(this._value, this._then);

  // ignore: unused_field
  final $Val _value;
  // ignore: unused_field
  final $Res Function($Val) _then;

  /// Create a copy of ProviderResult
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? provider = null,
    Object? success = null,
    Object? processingTimeMs = null,
    Object? detections = null,
    Object? error = freezed,
  }) {
    return _then(_value.copyWith(
      provider: null == provider
          ? _value.provider
          : provider // ignore: cast_nullable_to_non_nullable
              as VisionProvider,
      success: null == success
          ? _value.success
          : success // ignore: cast_nullable_to_non_nullable
              as bool,
      processingTimeMs: null == processingTimeMs
          ? _value.processingTimeMs
          : processingTimeMs // ignore: cast_nullable_to_non_nullable
              as int,
      detections: null == detections
          ? _value.detections
          : detections // ignore: cast_nullable_to_non_nullable
              as List<Detection>,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
    ) as $Val);
  }
}

/// @nodoc
abstract class _$$ProviderResultImplCopyWith<$Res>
    implements $ProviderResultCopyWith<$Res> {
  factory _$$ProviderResultImplCopyWith(_$ProviderResultImpl value,
          $Res Function(_$ProviderResultImpl) then) =
      __$$ProviderResultImplCopyWithImpl<$Res>;
  @override
  @useResult
  $Res call(
      {VisionProvider provider,
      bool success,
      int processingTimeMs,
      List<Detection> detections,
      String? error});
}

/// @nodoc
class __$$ProviderResultImplCopyWithImpl<$Res>
    extends _$ProviderResultCopyWithImpl<$Res, _$ProviderResultImpl>
    implements _$$ProviderResultImplCopyWith<$Res> {
  __$$ProviderResultImplCopyWithImpl(
      _$ProviderResultImpl _value, $Res Function(_$ProviderResultImpl) _then)
      : super(_value, _then);

  /// Create a copy of ProviderResult
  /// with the given fields replaced by the non-null parameter values.
  @pragma('vm:prefer-inline')
  @override
  $Res call({
    Object? provider = null,
    Object? success = null,
    Object? processingTimeMs = null,
    Object? detections = null,
    Object? error = freezed,
  }) {
    return _then(_$ProviderResultImpl(
      provider: null == provider
          ? _value.provider
          : provider // ignore: cast_nullable_to_non_nullable
              as VisionProvider,
      success: null == success
          ? _value.success
          : success // ignore: cast_nullable_to_non_nullable
              as bool,
      processingTimeMs: null == processingTimeMs
          ? _value.processingTimeMs
          : processingTimeMs // ignore: cast_nullable_to_non_nullable
              as int,
      detections: null == detections
          ? _value._detections
          : detections // ignore: cast_nullable_to_non_nullable
              as List<Detection>,
      error: freezed == error
          ? _value.error
          : error // ignore: cast_nullable_to_non_nullable
              as String?,
    ));
  }
}

/// @nodoc
@JsonSerializable()
class _$ProviderResultImpl implements _ProviderResult {
  const _$ProviderResultImpl(
      {required this.provider,
      required this.success,
      required this.processingTimeMs,
      required final List<Detection> detections,
      this.error})
      : _detections = detections;

  factory _$ProviderResultImpl.fromJson(Map<String, dynamic> json) =>
      _$$ProviderResultImplFromJson(json);

  /// Which provider returned this result
  @override
  final VisionProvider provider;

  /// Whether the provider succeeded
  @override
  final bool success;

  /// Processing time in milliseconds
  @override
  final int processingTimeMs;

  /// Detections from this provider (empty if failed)
  final List<Detection> _detections;

  /// Detections from this provider (empty if failed)
  @override
  List<Detection> get detections {
    if (_detections is EqualUnmodifiableListView) return _detections;
    // ignore: implicit_dynamic_type
    return EqualUnmodifiableListView(_detections);
  }

  /// Error message if failed
  @override
  final String? error;

  @override
  String toString() {
    return 'ProviderResult(provider: $provider, success: $success, processingTimeMs: $processingTimeMs, detections: $detections, error: $error)';
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is _$ProviderResultImpl &&
            (identical(other.provider, provider) ||
                other.provider == provider) &&
            (identical(other.success, success) || other.success == success) &&
            (identical(other.processingTimeMs, processingTimeMs) ||
                other.processingTimeMs == processingTimeMs) &&
            const DeepCollectionEquality()
                .equals(other._detections, _detections) &&
            (identical(other.error, error) || other.error == error));
  }

  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  int get hashCode => Object.hash(
      runtimeType,
      provider,
      success,
      processingTimeMs,
      const DeepCollectionEquality().hash(_detections),
      error);

  /// Create a copy of ProviderResult
  /// with the given fields replaced by the non-null parameter values.
  @JsonKey(includeFromJson: false, includeToJson: false)
  @override
  @pragma('vm:prefer-inline')
  _$$ProviderResultImplCopyWith<_$ProviderResultImpl> get copyWith =>
      __$$ProviderResultImplCopyWithImpl<_$ProviderResultImpl>(
          this, _$identity);

  @override
  Map<String, dynamic> toJson() {
    return _$$ProviderResultImplToJson(
      this,
    );
  }
}

abstract class _ProviderResult implements ProviderResult {
  const factory _ProviderResult(
      {required final VisionProvider provider,
      required final bool success,
      required final int processingTimeMs,
      required final List<Detection> detections,
      final String? error}) = _$ProviderResultImpl;

  factory _ProviderResult.fromJson(Map<String, dynamic> json) =
      _$ProviderResultImpl.fromJson;

  /// Which provider returned this result
  @override
  VisionProvider get provider;

  /// Whether the provider succeeded
  @override
  bool get success;

  /// Processing time in milliseconds
  @override
  int get processingTimeMs;

  /// Detections from this provider (empty if failed)
  @override
  List<Detection> get detections;

  /// Error message if failed
  @override
  String? get error;

  /// Create a copy of ProviderResult
  /// with the given fields replaced by the non-null parameter values.
  @override
  @JsonKey(includeFromJson: false, includeToJson: false)
  _$$ProviderResultImplCopyWith<_$ProviderResultImpl> get copyWith =>
      throw _privateConstructorUsedError;
}
