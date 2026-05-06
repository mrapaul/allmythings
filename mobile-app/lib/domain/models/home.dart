import 'package:flutter/foundation.dart';

/// A "home" the user is cataloguing. Single-home bootstrap is the default,
/// but the data shape is plural-ready so multi-home support is a Settings
/// action away — items get scoped via [Home.id] without schema changes.
@immutable
class Home {
  const Home({required this.id, required this.name, required this.icon});

  final String id;
  final String name;

  /// Emoji rendered in the TopBar pill and home picker (🏡 / 🛋️ / etc.).
  final String icon;

  factory Home.fromJson(Map<String, dynamic> json) => Home(
        id: json['id'] as String,
        name: json['name'] as String,
        icon: json['icon'] as String? ?? '🏡',
      );

  Home copyWith({String? id, String? name, String? icon}) =>
      Home(id: id ?? this.id, name: name ?? this.name, icon: icon ?? this.icon);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'icon': icon};

  @override
  bool operator ==(Object other) =>
      other is Home && other.id == id && other.name == name && other.icon == icon;

  @override
  int get hashCode => Object.hash(id, name, icon);
}
