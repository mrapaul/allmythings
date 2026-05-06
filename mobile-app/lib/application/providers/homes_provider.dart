import 'dart:async';
import 'dart:convert';

import 'package:all_my_things/domain/models/home.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persisted state of the homes registry.
///
/// Single-home is the bootstrap default. The shape is intentionally plural
/// so adding more homes later is a no-schema-change UI action; the
/// inventory items will simply scope to [activeHomeId].
@immutable
class HomesState {
  const HomesState({required this.homes, required this.activeHomeId});

  final List<Home> homes;
  final String activeHomeId;

  Home get activeHome =>
      homes.firstWhere((h) => h.id == activeHomeId, orElse: () => homes.first);

  HomesState copyWith({List<Home>? homes, String? activeHomeId}) => HomesState(
        homes: homes ?? this.homes,
        activeHomeId: activeHomeId ?? this.activeHomeId,
      );

  static const Home _defaultHome =
      Home(id: 'home-default', name: 'My Home', icon: '🏡');
  static const HomesState bootstrap =
      HomesState(homes: [_defaultHome], activeHomeId: 'home-default');
}

const _kHomesKey = 'allmythings.homes.v1';
const _kActiveHomeKey = 'allmythings.homes.active.v1';

/// Manages the homes registry + active home selection, persisted in
/// SharedPreferences. Mirrors design/contexts/HomesContext.tsx (single
/// `home_inventory_homes_v1` namespace).
class HomesNotifier extends AsyncNotifier<HomesState> {
  @override
  Future<HomesState> build() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kHomesKey);
    if (raw == null) {
      // First boot — persist defaults so we always know what we wrote.
      await _writeState(prefs, HomesState.bootstrap);
      return HomesState.bootstrap;
    }
    try {
      final decoded = (jsonDecode(raw) as List<dynamic>)
          .map((e) => Home.fromJson(e as Map<String, dynamic>))
          .toList();
      if (decoded.isEmpty) return HomesState.bootstrap;
      final activeId = prefs.getString(_kActiveHomeKey) ?? decoded.first.id;
      final resolvedActive =
          decoded.any((h) => h.id == activeId) ? activeId : decoded.first.id;
      return HomesState(homes: decoded, activeHomeId: resolvedActive);
    } on FormatException catch (e) {
      debugPrint('[HOMES] failed to decode persisted homes: $e — using defaults');
      return HomesState.bootstrap;
    }
  }

  Future<void> _writeState(SharedPreferences prefs, HomesState s) async {
    await prefs.setString(
      _kHomesKey,
      jsonEncode(s.homes.map((h) => h.toJson()).toList()),
    );
    await prefs.setString(_kActiveHomeKey, s.activeHomeId);
  }

  Future<void> setActiveHome(String homeId) async {
    final current = state.value;
    if (current == null) return;
    if (!current.homes.any((h) => h.id == homeId)) return;
    final next = current.copyWith(activeHomeId: homeId);
    state = AsyncValue.data(next);
    final prefs = await SharedPreferences.getInstance();
    await _writeState(prefs, next);
  }

  /// Add a new home and switch to it. Multi-home extension point — single
  /// home bootstrap calls this never; Settings can call it freely.
  Future<Home> addHome({required String name, String icon = '🏡'}) async {
    final current = state.value ?? HomesState.bootstrap;
    final id =
        'home-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
    final home = Home(id: id, name: name.trim().isEmpty ? 'New Home' : name.trim(), icon: icon);
    final next = HomesState(homes: [...current.homes, home], activeHomeId: id);
    state = AsyncValue.data(next);
    final prefs = await SharedPreferences.getInstance();
    await _writeState(prefs, next);
    return home;
  }

  Future<void> renameHome(String homeId, String name) async {
    final current = state.value;
    if (current == null) return;
    final next = current.copyWith(
      homes: current.homes
          .map((h) => h.id == homeId ? h.copyWith(name: name) : h)
          .toList(),
    );
    state = AsyncValue.data(next);
    final prefs = await SharedPreferences.getInstance();
    await _writeState(prefs, next);
  }

  Future<void> setHomeIcon(String homeId, String icon) async {
    final current = state.value;
    if (current == null) return;
    final next = current.copyWith(
      homes: current.homes
          .map((h) => h.id == homeId ? h.copyWith(icon: icon) : h)
          .toList(),
    );
    state = AsyncValue.data(next);
    final prefs = await SharedPreferences.getInstance();
    await _writeState(prefs, next);
  }

  /// Remove a home. Refuses to delete the last remaining home — there is
  /// always at least one to scope items to.
  Future<void> removeHome(String homeId) async {
    final current = state.value;
    if (current == null || current.homes.length <= 1) return;
    final remaining = current.homes.where((h) => h.id != homeId).toList();
    final activeId = current.activeHomeId == homeId
        ? remaining.first.id
        : current.activeHomeId;
    final next = HomesState(homes: remaining, activeHomeId: activeId);
    state = AsyncValue.data(next);
    final prefs = await SharedPreferences.getInstance();
    await _writeState(prefs, next);
  }
}

final homesProvider =
    AsyncNotifierProvider<HomesNotifier, HomesState>(HomesNotifier.new);
