import 'package:permission_handler/permission_handler.dart';

/// Camera permission handler
class CameraPermissionHandler {
  /// Request camera permission
  /// Returns true if granted, throws on denial
  Future<bool> requestPermission() async {
    final status = await Permission.camera.request();

    if (status.isGranted) {
      return true;
    } else if (status.isPermanentlyDenied) {
      throw Exception(
        'Camera permission permanently denied. Please enable in settings.',
      );
    } else {
      throw Exception('Camera permission denied.');
    }
  }

  /// Check if camera permission is granted
  Future<bool> checkPermission() async {
    final status = await Permission.camera.status;
    return status.isGranted;
  }

  /// Open app settings
  Future<void> openSettings() async {
    await openAppSettings();
  }
}
