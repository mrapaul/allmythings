import 'dart:io' show Platform;

import 'package:all_my_things/native/mac_server_discovery.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

/// Application configuration
class AppConfig {
  static String? _resolvedApiBaseUrl;

  /// Call once at app startup to resolve the Mac server URL via mDNS.
  /// Falls back to Gemini cloud endpoint if Mac is not found within 2 seconds.
  static Future<void> initialize() async {
    if (kIsWeb) {
      _resolvedApiBaseUrl = 'http://localhost:14000';
      return;
    }
    if (!kIsWeb) {
      try {
        if (Platform.isAndroid) {
          _resolvedApiBaseUrl = 'http://10.0.2.2:14000';
          return;
        }
        if (Platform.isIOS) {
          final discovered = await MacServerDiscovery.resolve();
          _resolvedApiBaseUrl = discovered ?? 'http://localhost:14000';
          return;
        }
      } on Exception catch (_) {}
    }
    _resolvedApiBaseUrl = 'http://localhost:14000';
  }

  /// Resolved API base URL. Returns localhost fallback if initialize() hasn't run.
  static String get apiBaseUrl => _resolvedApiBaseUrl ?? 'http://localhost:14000';

  static const int apiTimeout = 30000; // 30 seconds (was 5 minutes — tiered timeouts used instead)

  static const String apiKey = String.fromEnvironment('API_KEY');

  static const String appName = 'Home Inventory';
  static const String apiPort = '14000';

  static const double minConfidence = 0.3; // Wide net: was 0.7
  static const int maxRetries = 3;

  static const int thumbnailSize = 300;
  static const int imageQuality = 85;
}
