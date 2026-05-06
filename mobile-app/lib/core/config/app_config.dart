import 'dart:io' show Platform;

import 'package:all_my_things/native/mac_server_discovery.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

/// Application configuration
class AppConfig {
  static String? _resolvedApiBaseUrl;

  /// Call once at app startup to resolve the Mac server URL via mDNS.
  /// Falls back to localhost if Mac is not found within the timeout.
  static Future<void> initialize() async {
    if (kIsWeb) {
      _resolvedApiBaseUrl = 'http://localhost:14000';
      return;
    }
    if (Platform.isAndroid) {
      _resolvedApiBaseUrl = 'http://10.0.2.2:14000';
      return;
    }
    if (Platform.isIOS) {
      final discovered = await MacServerDiscovery.resolve();
      _resolvedApiBaseUrl = discovered ?? 'http://localhost:14000';
      return;
    }
    _resolvedApiBaseUrl = 'http://localhost:14000';
  }

  /// Force a fresh mDNS browse and replace the cached URL. Called by
  /// the API client when an HTTP request fails with a connection error
  /// — the Mac's Bonjour SRV record can rot across sleep/wake (the
  /// `.local` suffix increments) and the previously cached URL points
  /// at a hostname that no longer resolves. A re-browse picks up the
  /// current advertisement without forcing the user to restart the app.
  static Future<String?> refresh() async {
    if (!Platform.isIOS) return _resolvedApiBaseUrl;
    final discovered = await MacServerDiscovery.resolve();
    if (discovered != null) {
      _resolvedApiBaseUrl = discovered;
    }
    return _resolvedApiBaseUrl;
  }

  /// Resolved API base URL. Returns localhost fallback if initialize() hasn't run.
  static String get apiBaseUrl => _resolvedApiBaseUrl ?? 'http://localhost:14000';

  static const int apiTimeout = 120000; // 120 seconds — VLM deep pass can take 30–60s with Ollama multi-pass

  static const String apiKey = String.fromEnvironment('API_KEY');

  static const String appName = 'Home Inventory';
  static const String apiPort = '14000';

  static const double minConfidence = 0.3; // Wide net: was 0.7
  static const int maxRetries = 3;

  static const int thumbnailSize = 300;
  static const int imageQuality = 85;
}
