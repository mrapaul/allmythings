import 'dart:io';
import 'package:camera/camera.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'package:fpdart/fpdart.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/errors/failures.dart';

/// Service for capturing photos with camera
class PhotoCaptureService {
  CameraController? _controller;
  List<CameraDescription>? _cameras;

  /// Initialize camera
  Future<Either<Failure, void>> initialize() async {
    try {
      _cameras = await availableCameras();

      if (_cameras == null || _cameras!.isEmpty) {
        return left(
          const Failure.camera(message: 'No cameras available'),
        );
      }

      // Use back camera
      final camera = _cameras!.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => _cameras!.first,
      );

      _controller = CameraController(
        camera,
        ResolutionPreset.high,
        enableAudio: false,
      );

      await _controller!.initialize();
      return right(null);
    } catch (e) {
      return left(
        Failure.camera(message: 'Failed to initialize camera: $e'),
      );
    }
  }

  /// Get camera controller
  CameraController? get controller => _controller;

  /// Capture photo
  Future<Either<Failure, File>> capturePhoto() async {
    if (_controller == null || !_controller!.value.isInitialized) {
      return left(
        const Failure.camera(message: 'Camera not initialized'),
      );
    }

    try {
      final image = await _controller!.takePicture();
      final directory = await getApplicationDocumentsDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final path = p.join(directory.path, 'photos', 'photo_$timestamp.jpg');

      // Create directory if needed
      final photoDir = Directory(p.dirname(path));
      if (!await photoDir.exists()) {
        await photoDir.create(recursive: true);
      }

      // Copy to permanent location
      final file = await File(image.path).copy(path);
      return right(file);
    } catch (e) {
      return left(
        Failure.camera(message: 'Failed to capture photo: $e'),
      );
    }
  }

  /// Dispose camera
  Future<void> dispose() async {
    await _controller?.dispose();
    _controller = null;
  }

  /// Check if camera permission is granted
  Future<bool> hasPermission() async {
    final status = await Permission.camera.status;
    return status == PermissionStatus.granted;
  }

  /// Request camera permission
  Future<bool> requestPermission() async {
    final status = await Permission.camera.request();
    return status == PermissionStatus.granted;
  }

  /// Set flash mode
  Future<void> setFlashMode(FlashMode mode) async {
    if (_controller == null || !_controller!.value.isInitialized) {
      return;
    }
    await _controller!.setFlashMode(mode);
  }
}
