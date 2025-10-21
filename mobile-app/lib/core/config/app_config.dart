/// Application configuration
class AppConfig {
  // API Configuration
  static const String apiBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:9100');

  static const int apiTimeout = 30000; // 30 seconds

  // Deployment Configuration
  static const String appName = 'Home Inventory';
  static const String apiPort = '9100';

  // Detection Configuration
  static const double minConfidence = 0.7;
  static const int maxRetries = 3;

  // Camera Configuration
  static const int thumbnailSize = 256;
  static const int imageQuality = 85;
}
