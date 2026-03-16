import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

/// Application configuration
class AppConfig {
  // API Configuration
  static String get apiBaseUrl {
    const String envUrl = String.fromEnvironment('API_URL');
    if (envUrl.isNotEmpty) {
      return envUrl;
    }
    
    // Default fallback logic for local development
    if (kIsWeb) {
      return 'http://localhost:14000';
    }
    try {
      if (Platform.isAndroid) {
        // Android emulator sees host as 10.0.2.2
        return 'http://10.0.2.2:14000';
      }
    } catch (_) {}
    
    // iOS Simulator and desktop
    return 'http://localhost:14000';
  }

  static const int apiTimeout = 300000; // 5 minutes

  // API Authentication
  static const String apiKey = String.fromEnvironment(
    'API_KEY',
  );

  // Deployment Configuration
  static const String appName = 'Home Inventory';
  static const String apiPort = '14000';


  // Detection Configuration
  static const double minConfidence = 0.7;
  static const int maxRetries = 3;

  // Camera Configuration
  static const int thumbnailSize = 300;
  static const int imageQuality = 85;
}
