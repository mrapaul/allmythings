/// Appium Configuration for Mobile App E2E Testing
/// Supports both iOS (iPhone simulator) and Android (emulator)
/// Integrates with CI/CD pipeline for regression testing

import 'package:webdriver/webdriver.dart' as wd;

class AppiumConfig {
  static const String iosAppPath = 'ios/Runner.app';
  static const String androidAppPath = 'android/app/build/outputs/apk/release/app-release.apk';
  static const String iosSimulatorUdid = 'com.apple.CoreSimulator.CoreSimulatorService';
  static const String androidDeviceName = 'Android Emulator';

  /// iOS Simulator Capabilities
  static Map<String, dynamic> getiOSCapabilities() {
    return {
      'platformName': 'iOS',
      'automationName': 'XCUITest',
      'deviceName': 'iPhone 16',
      'platformVersion': '18.0',
      'app': iosAppPath,
      'xcodeOrgId': 'com.example',
      'xcodeSigningId': 'iPhone Developer',
      'updatedWDABundleId': 'com.facebook.WebDriverAgentRunner',
      'usePrebuiltWDA': true,
      'waitForQuiescence': true,
      'shouldUseCompactResponses': false,
      'eventDelay': 200,
    };
  }

  /// Android Emulator Capabilities
  static Map<String, dynamic> getAndroidCapabilities() {
    return {
      'platformName': 'Android',
      'automationName': 'UiAutomator2',
      'deviceName': androidDeviceName,
      'app': androidAppPath,
      'appPackage': 'com.homeinventory.all_my_things',
      'appActivity': 'com.homeinventory.all_my_things.MainActivity',
      'noReset': false,
      'fullReset': false,
      'autoGrantPermissions': true,
      'waitForQuiescence': true,
      'newCommandTimeout': 300,
      'adbExecTimeout': 20000,
      'uiautomator2ServerInstallTimeout': 60000,
    };
  }

  /// Test Environment Configuration
  static const String appiumServerUrl = 'http://127.0.0.1:4723/wd/hub';
  static const Duration elementWaitTimeout = Duration(seconds: 10);
  static const Duration pageLoadTimeout = Duration(seconds: 15);
  static const Duration implicitWaitTimeout = Duration(seconds: 10);

  /// Appium Server Start Command
  static const String startAppiumServer = 'appium --port 4723 --log-level debug';

  /// Build and Installation
  static Future<void> buildApp(String platform) async {
    if (platform == 'ios') {
      // flutter build ios --simulator
      print('Building iOS app for simulator...');
    } else if (platform == 'android') {
      // flutter build apk --release
      print('Building Android APK for emulator...');
    }
  }
}

/// AppiumDriver Wrapper for Test Execution
class AppiumTestDriver {
  late wd.WebDriver driver;
  late String platform;

  AppiumTestDriver({required this.platform});

  Future<void> initializeDriver() async {
    try {
      final capabilities = platform == 'ios'
          ? AppiumConfig.getiOSCapabilities()
          : AppiumConfig.getAndroidCapabilities();

      driver = await wd.WebDriver.fromCapabilities(
        desired: wd.Capabilities(capabilities),
        uri: Uri.parse(AppiumConfig.appiumServerUrl),
      );

      // Set timeouts
      await driver.timeouts.implicitWait(AppiumConfig.implicitWaitTimeout);
      await driver.timeouts.pageLoad(AppiumConfig.pageLoadTimeout);

      print('Appium driver initialized for $platform');
    } catch (e) {
      print('Error initializing Appium driver: $e');
      rethrow;
    }
  }

  Future<void> findAndTap(String elementId) async {
    try {
      final element = await driver.findElement(wd.By.id(elementId));
      await element.click();
    } catch (e) {
      print('Error tapping element $elementId: $e');
      rethrow;
    }
  }

  Future<void> enterText(String elementId, String text) async {
    try {
      final element = await driver.findElement(wd.By.id(elementId));
      await element.clear();
      await element.sendKeys(text);
    } catch (e) {
      print('Error entering text in $elementId: $e');
      rethrow;
    }
  }

  Future<String?> getText(String elementId) async {
    try {
      final element = await driver.findElement(wd.By.id(elementId));
      return await element.text;
    } catch (e) {
      print('Error getting text from $elementId: $e');
      return null;
    }
  }

  Future<bool> isElementDisplayed(String elementId) async {
    try {
      final element = await driver.findElement(wd.By.id(elementId));
      return await element.displayed;
    } catch (e) {
      return false;
    }
  }

  Future<void> waitForElement(String elementId,
      {Duration timeout = const Duration(seconds: 10)}) async {
    final endTime = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(endTime)) {
      if (await isElementDisplayed(elementId)) {
        return;
      }
      await Future.delayed(const Duration(milliseconds: 500));
    }
    throw TimeoutException('Element $elementId not found');
  }

  Future<void> closeDriver() async {
    await driver.quit();
  }
}
