import 'package:camera/camera.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for available cameras
final availableCamerasProvider = FutureProvider<List<CameraDescription>>((ref) async {
  return availableCameras();
});

/// State for camera controller
class CameraControllerState {
  const CameraControllerState({
    this.controller,
    this.isInitialized = false,
    this.error,
  });

  final CameraController? controller;
  final bool isInitialized;
  final String? error;

  CameraControllerState copyWith({
    CameraController? controller,
    bool? isInitialized,
    String? error,
  }) {
    return CameraControllerState(
      controller: controller ?? this.controller,
      isInitialized: isInitialized ?? this.isInitialized,
      error: error ?? this.error,
    );
  }
}

/// Notifier for camera controller using modern Riverpod Notifier pattern
class CameraControllerNotifier extends Notifier<CameraControllerState> {
  @override
  CameraControllerState build() => const CameraControllerState();

  /// Initialize camera with the given description
  Future<void> initialize(CameraDescription description) async {
    try {
      // Dispose existing controller if any
      final oldController = state.controller;
      if (oldController != null) {
        await oldController.dispose();
      }

      final controller = CameraController(
        description,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await controller.initialize();

      state = CameraControllerState(
        controller: controller,
        isInitialized: true,
      );
    } catch (e) {
      state = CameraControllerState(
        error: 'Failed to initialize camera: $e',
      );
    }
  }

  /// Toggle flash mode
  Future<void> toggleFlash() async {
    final controller = state.controller;
    if (controller == null || !state.isInitialized) return;

    try {
      final currentMode = controller.value.flashMode;
      final newMode = currentMode == FlashMode.off ? FlashMode.auto : FlashMode.off;
      await controller.setFlashMode(newMode);

      // Trigger rebuild
      state = state.copyWith();
    } catch (e) {
      state = state.copyWith(error: 'Failed to toggle flash: $e');
    }
  }

  /// Switch between front and back camera
  Future<void> switchCamera(List<CameraDescription> cameras) async {
    if (cameras.isEmpty) return;

    final currentController = state.controller;
    if (currentController == null) return;

    try {
      // Find the opposite camera
      final currentLens = currentController.description.lensDirection;
      final targetLens = currentLens == CameraLensDirection.back
          ? CameraLensDirection.front
          : CameraLensDirection.back;

      final targetCamera = cameras.firstWhere(
        (camera) => camera.lensDirection == targetLens,
        orElse: () => cameras.first,
      );

      await initialize(targetCamera);
    } catch (e) {
      state = state.copyWith(error: 'Failed to switch camera: $e');
    }
  }
}

/// Provider for camera controller
final cameraControllerProvider =
    NotifierProvider<CameraControllerNotifier, CameraControllerState>(
  CameraControllerNotifier.new,
);

/// State for flash mode
final flashModeProvider = Provider<FlashMode>((ref) {
  final cameraState = ref.watch(cameraControllerProvider);
  return cameraState.controller?.value.flashMode ?? FlashMode.off;
});
