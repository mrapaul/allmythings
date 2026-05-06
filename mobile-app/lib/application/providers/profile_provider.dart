import 'dart:async';
import 'dart:convert';

import 'package:all_my_things/domain/models/user_profile.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kProfileKey = 'allmythings.profile.v1';

/// Persists the user-facing display name + initials shown in the TopBar
/// avatar and profile screen. Mirrors design/contexts/HomesContext.tsx's
/// `profile` slice.
class ProfileNotifier extends AsyncNotifier<UserProfile> {
  @override
  Future<UserProfile> build() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kProfileKey);
    if (raw == null) {
      await prefs.setString(_kProfileKey, jsonEncode(UserProfile.defaults.toJson()));
      return UserProfile.defaults;
    }
    try {
      return UserProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on FormatException catch (e) {
      debugPrint('[PROFILE] decode failed: $e — using defaults');
      return UserProfile.defaults;
    }
  }

  Future<void> updateProfile({String? name, String? initials}) async {
    final current = state.value ?? UserProfile.defaults;
    final next = current.copyWith(
      name: name?.trim().isNotEmpty == true ? name!.trim() : null,
      initials:
          initials?.trim().isNotEmpty == true ? initials!.trim().toUpperCase() : null,
    );
    state = AsyncValue.data(next);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kProfileKey, jsonEncode(next.toJson()));
  }
}

final profileProvider =
    AsyncNotifierProvider<ProfileNotifier, UserProfile>(ProfileNotifier.new);
