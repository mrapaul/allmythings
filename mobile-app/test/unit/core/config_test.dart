import 'package:all_my_things/core/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AppConfig Tests', () {
    test('apiBaseUrl returns default value when no environment variable is set', () {
      // By default in test environment, it should return localhost or the platform-specific default
      final url = AppConfig.apiBaseUrl;
      expect(url, contains('14000'));
    });

    test('apiPort is 14000', () {
      expect(AppConfig.apiPort, '14000');
    });
  });
}
