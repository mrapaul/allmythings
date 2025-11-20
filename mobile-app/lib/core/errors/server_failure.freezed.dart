// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'server_failure.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$ServerFailure {





@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ServerFailure);
}


@override
int get hashCode => runtimeType.hashCode;



}

/// @nodoc
class $ServerFailureCopyWith<$Res>  {
$ServerFailureCopyWith(ServerFailure _, $Res Function(ServerFailure) __);
}


/// Adds pattern-matching-related methods to [ServerFailure].
extension ServerFailurePatterns on ServerFailure {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _ServerFailure value)?  $default,{TResult Function( NetworkError value)?  networkError,TResult Function( ServerError value)?  serverError,TResult Function( Unauthorized value)?  unauthorized,TResult Function( NotFound value)?  notFound,TResult Function( PermissionDenied value)?  permissionDenied,TResult Function( ValidationError value)?  validationError,required TResult orElse(),}){
final _that = this;
switch (_that) {
case _ServerFailure() when $default != null:
return $default(_that);case NetworkError() when networkError != null:
return networkError(_that);case ServerError() when serverError != null:
return serverError(_that);case Unauthorized() when unauthorized != null:
return unauthorized(_that);case NotFound() when notFound != null:
return notFound(_that);case PermissionDenied() when permissionDenied != null:
return permissionDenied(_that);case ValidationError() when validationError != null:
return validationError(_that);case _:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _ServerFailure value)  $default,{required TResult Function( NetworkError value)  networkError,required TResult Function( ServerError value)  serverError,required TResult Function( Unauthorized value)  unauthorized,required TResult Function( NotFound value)  notFound,required TResult Function( PermissionDenied value)  permissionDenied,required TResult Function( ValidationError value)  validationError,}){
final _that = this;
switch (_that) {
case _ServerFailure():
return $default(_that);case NetworkError():
return networkError(_that);case ServerError():
return serverError(_that);case Unauthorized():
return unauthorized(_that);case NotFound():
return notFound(_that);case PermissionDenied():
return permissionDenied(_that);case ValidationError():
return validationError(_that);case _:
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _ServerFailure value)?  $default,{TResult? Function( NetworkError value)?  networkError,TResult? Function( ServerError value)?  serverError,TResult? Function( Unauthorized value)?  unauthorized,TResult? Function( NotFound value)?  notFound,TResult? Function( PermissionDenied value)?  permissionDenied,TResult? Function( ValidationError value)?  validationError,}){
final _that = this;
switch (_that) {
case _ServerFailure() when $default != null:
return $default(_that);case NetworkError() when networkError != null:
return networkError(_that);case ServerError() when serverError != null:
return serverError(_that);case Unauthorized() when unauthorized != null:
return unauthorized(_that);case NotFound() when notFound != null:
return notFound(_that);case PermissionDenied() when permissionDenied != null:
return permissionDenied(_that);case ValidationError() when validationError != null:
return validationError(_that);case _:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String message)?  $default,{TResult Function()?  networkError,TResult Function( String message)?  serverError,TResult Function()?  unauthorized,TResult Function()?  notFound,TResult Function()?  permissionDenied,TResult Function( String message)?  validationError,required TResult orElse(),}) {final _that = this;
switch (_that) {
case _ServerFailure() when $default != null:
return $default(_that.message);case NetworkError() when networkError != null:
return networkError();case ServerError() when serverError != null:
return serverError(_that.message);case Unauthorized() when unauthorized != null:
return unauthorized();case NotFound() when notFound != null:
return notFound();case PermissionDenied() when permissionDenied != null:
return permissionDenied();case ValidationError() when validationError != null:
return validationError(_that.message);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String message)  $default,{required TResult Function()  networkError,required TResult Function( String message)  serverError,required TResult Function()  unauthorized,required TResult Function()  notFound,required TResult Function()  permissionDenied,required TResult Function( String message)  validationError,}) {final _that = this;
switch (_that) {
case _ServerFailure():
return $default(_that.message);case NetworkError():
return networkError();case ServerError():
return serverError(_that.message);case Unauthorized():
return unauthorized();case NotFound():
return notFound();case PermissionDenied():
return permissionDenied();case ValidationError():
return validationError(_that.message);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String message)?  $default,{TResult? Function()?  networkError,TResult? Function( String message)?  serverError,TResult? Function()?  unauthorized,TResult? Function()?  notFound,TResult? Function()?  permissionDenied,TResult? Function( String message)?  validationError,}) {final _that = this;
switch (_that) {
case _ServerFailure() when $default != null:
return $default(_that.message);case NetworkError() when networkError != null:
return networkError();case ServerError() when serverError != null:
return serverError(_that.message);case Unauthorized() when unauthorized != null:
return unauthorized();case NotFound() when notFound != null:
return notFound();case PermissionDenied() when permissionDenied != null:
return permissionDenied();case ValidationError() when validationError != null:
return validationError(_that.message);case _:
  return null;

}
}

}

/// @nodoc


class _ServerFailure implements ServerFailure {
  const _ServerFailure(this.message);
  

 final  String message;

/// Create a copy of ServerFailure
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ServerFailureCopyWith<_ServerFailure> get copyWith => __$ServerFailureCopyWithImpl<_ServerFailure>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _ServerFailure&&(identical(other.message, message) || other.message == message));
}


@override
int get hashCode => Object.hash(runtimeType,message);



}

/// @nodoc
abstract mixin class _$ServerFailureCopyWith<$Res> implements $ServerFailureCopyWith<$Res> {
  factory _$ServerFailureCopyWith(_ServerFailure value, $Res Function(_ServerFailure) _then) = __$ServerFailureCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class __$ServerFailureCopyWithImpl<$Res>
    implements _$ServerFailureCopyWith<$Res> {
  __$ServerFailureCopyWithImpl(this._self, this._then);

  final _ServerFailure _self;
  final $Res Function(_ServerFailure) _then;

/// Create a copy of ServerFailure
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(_ServerFailure(
null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

/// @nodoc


class NetworkError implements ServerFailure {
  const NetworkError();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is NetworkError);
}


@override
int get hashCode => runtimeType.hashCode;



}




/// @nodoc


class ServerError implements ServerFailure {
  const ServerError(this.message);
  

 final  String message;

/// Create a copy of ServerFailure
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ServerErrorCopyWith<ServerError> get copyWith => _$ServerErrorCopyWithImpl<ServerError>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ServerError&&(identical(other.message, message) || other.message == message));
}


@override
int get hashCode => Object.hash(runtimeType,message);



}

/// @nodoc
abstract mixin class $ServerErrorCopyWith<$Res> implements $ServerFailureCopyWith<$Res> {
  factory $ServerErrorCopyWith(ServerError value, $Res Function(ServerError) _then) = _$ServerErrorCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class _$ServerErrorCopyWithImpl<$Res>
    implements $ServerErrorCopyWith<$Res> {
  _$ServerErrorCopyWithImpl(this._self, this._then);

  final ServerError _self;
  final $Res Function(ServerError) _then;

/// Create a copy of ServerFailure
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(ServerError(
null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

/// @nodoc


class Unauthorized implements ServerFailure {
  const Unauthorized();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Unauthorized);
}


@override
int get hashCode => runtimeType.hashCode;



}




/// @nodoc


class NotFound implements ServerFailure {
  const NotFound();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is NotFound);
}


@override
int get hashCode => runtimeType.hashCode;



}




/// @nodoc


class PermissionDenied implements ServerFailure {
  const PermissionDenied();
  






@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PermissionDenied);
}


@override
int get hashCode => runtimeType.hashCode;



}




/// @nodoc


class ValidationError implements ServerFailure {
  const ValidationError(this.message);
  

 final  String message;

/// Create a copy of ServerFailure
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ValidationErrorCopyWith<ValidationError> get copyWith => _$ValidationErrorCopyWithImpl<ValidationError>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is ValidationError&&(identical(other.message, message) || other.message == message));
}


@override
int get hashCode => Object.hash(runtimeType,message);



}

/// @nodoc
abstract mixin class $ValidationErrorCopyWith<$Res> implements $ServerFailureCopyWith<$Res> {
  factory $ValidationErrorCopyWith(ValidationError value, $Res Function(ValidationError) _then) = _$ValidationErrorCopyWithImpl;
@useResult
$Res call({
 String message
});




}
/// @nodoc
class _$ValidationErrorCopyWithImpl<$Res>
    implements $ValidationErrorCopyWith<$Res> {
  _$ValidationErrorCopyWithImpl(this._self, this._then);

  final ValidationError _self;
  final $Res Function(ValidationError) _then;

/// Create a copy of ServerFailure
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') $Res call({Object? message = null,}) {
  return _then(ValidationError(
null == message ? _self.message : message // ignore: cast_nullable_to_non_nullable
as String,
  ));
}


}

// dart format on
