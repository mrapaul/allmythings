/// Application configuration
class AppConfig {
  // API Configuration
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );

  static const int apiTimeout = 30000; // 30 seconds

  // API Authentication
  static const String apiKey = String.fromEnvironment(
    'API_KEY',
    defaultValue: '',
  );

  // Deployment Configuration
  static const String appName = 'Home Inventory';
  static const String apiPort = '8000';

  // Detection Configuration
  static const double minConfidence = 0.7;
  static const int maxRetries = 3;

  // Camera Configuration
  static const int thumbnailSize = 300;
  static const int imageQuality = 85;
}
