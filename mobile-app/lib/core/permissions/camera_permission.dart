import 'package:permission_handler/permission_handler.dart';
import 'package:fpdart/fpdart.dart';
import '../errors/failures.dart';

/// Camera permission handler
class CameraPermissionHandler {
  /// Request camera permission
  Future<Either<Failure, bool>> requestPermission() async {
    try {
      final status = await Permission.camera.request();

      if (status.isGranted) {
        return right(true);
      } else if (status.isPermanentlyDenied) {
        return left(
          const Failure.permission(
            message: 'Camera permission permanently denied. Please enable in settings.',
          ),
        );
      } else {
        return left(
          const Failure.permission(
            message: 'Camera permission denied.',
          ),
        );
      }
    } catch (e) {
      return left(
        Failure.unexpected(
          message: 'Failed to request camera permission: $e',
        ),
      );
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
