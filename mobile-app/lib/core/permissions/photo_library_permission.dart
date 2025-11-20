import 'package:all_my_things/core/errors/failures.dart';
import 'package:fpdart/fpdart.dart';
import 'package:permission_handler/permission_handler.dart';

/// Photo library permission handler
class PhotoLibraryPermissionHandler {
  /// Request photo library permission
  Future<Either<Failure, bool>> requestPermission() async {
    try {
      final status = await Permission.photos.request();

      if (status.isGranted) {
        return right(true);
      } else if (status.isPermanentlyDenied) {
        return left(
          const Failure.permission(
            message:
                'Photo library permission permanently denied. Please enable in settings.',
          ),
        );
      } else {
        return left(
          const Failure.permission(
            message: 'Photo library permission denied.',
          ),
        );
      }
    } catch (e) {
      return left(
        Failure.unexpected(
          message: 'Failed to request photo library permission: $e',
        ),
      );
    }
  }

  /// Check if photo library permission is granted
  Future<bool> checkPermission() async {
    final status = await Permission.photos.status;
    return status.isGranted;
  }

  /// Open app settings
  Future<void> openSettings() async {
    await openAppSettings();
  }
}
