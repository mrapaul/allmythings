import 'package:flutter/foundation.dart';

/// User-displayable profile bits surfaced in the TopBar avatar and profile
/// screen. Non-authoritative — purely cosmetic, lives in SharedPreferences.
@immutable
class UserProfile {
  const UserProfile({required this.name, required this.initials});

  final String name;
  final String initials;

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        name: json['name'] as String? ?? 'You',
        initials: json['initials'] as String? ?? 'Y',
      );

  static const UserProfile defaults = UserProfile(name: 'You', initials: 'Y');

  UserProfile copyWith({String? name, String? initials}) => UserProfile(
        name: name ?? this.name,
        initials: initials ?? this.initials,
      );

  Map<String, dynamic> toJson() => {'name': name, 'initials': initials};

  @override
  bool operator ==(Object other) =>
      other is UserProfile && other.name == name && other.initials == initials;

  @override
  int get hashCode => Object.hash(name, initials);
}
