import 'dart:async';
import 'dart:io';

import 'package:all_my_things/application/providers/camera_providers.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

import 'package:image_picker/image_picker.dart';

/// Camera capture screen with minimal icon-only UI
class CameraCaptureScreen extends ConsumerStatefulWidget {
  const CameraCaptureScreen({super.key});

  @override
  ConsumerState<CameraCaptureScreen> createState() =>
      _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends ConsumerState<CameraCaptureScreen> {
  bool _isCapturing = false;
  File? _capturedImageFile;
  bool _showPreview = false;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    unawaited(_initializeCamera());
  }

  Future<void> _pickFromGallery() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 90,
      );
      
      if (image != null && mounted) {
        setState(() {
          _capturedImageFile = File(image.path);
          _showPreview = true;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to pick image: $e')),
        );
      }
    }
  }

  Future<void> _initializeCamera() async {
    final cameras = await ref.read(availableCamerasProvider.future);
    if (cameras.isEmpty) return;

    // Initialize with back camera
    final backCamera = cameras.firstWhere(
      (camera) => camera.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );

    await ref.read(cameraControllerProvider.notifier).initialize(backCamera);
  }

  Future<void> _capturePhoto() async {
    if (_isCapturing) return;

    // For macOS verification without physical camera
    if (Platform.isMacOS) {
      await _simulateCapture();
      return;
    }

    final cameraState = ref.read(cameraControllerProvider);
    final controller = cameraState.controller;

    if (controller == null || !cameraState.isInitialized) return;

    setState(() => _isCapturing = true);

    try {
      final image = await controller.takePicture();
      final directory = await getTemporaryDirectory();
      final filePath =
          '${directory.path}/${DateTime.now().millisecondsSinceEpoch}.jpg';
      final imageFile = await File(image.path).copy(filePath);

      if (mounted) {
        setState(() {
          _capturedImageFile = imageFile;
          _showPreview = true;
        });
      }
    } catch (e, st) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Capture error: $e'),
            duration: const Duration(seconds: 10),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isCapturing = false);
      }
    }
  }

  Future<void> _simulateCapture() async {
    setState(() => _isCapturing = true);
    try {
      // Small delay to simulate shutter
      await Future<void>.delayed(const Duration(milliseconds: 500));
      
      // Copy asset to temp file to avoid PathAccessException (Sandbox safe)
      final byteData = await rootBundle.load('assets/test_images/ai_interior.jpg');
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/ai_interior.jpg');
      
      // Ensure directory exists and write bytes
      await file.writeAsBytes(
        byteData.buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes),
        flush: true,
      );

      if (mounted) {
        setState(() {
          _capturedImageFile = file;
          _showPreview = true;
        });
      }
    } catch (e) {
      debugPrint('Simulation failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Simulation failed: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isCapturing = false);
      }
    }
  }

  Future<void> _proceedWithImage() async {
    if (_capturedImageFile == null) return;

    if (mounted) {
      setState(() => _isCapturing = true);
      
      try {
        // Start background identification - do NOT await here
        unawaited(ref.read(inventoryItemsProvider.notifier).processImageInBackground(_capturedImageFile!));

        if (mounted) {
          // Return to collection instantly
          context.go('/items');
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Process error: $e'),
              duration: const Duration(seconds: 10),
            ),
          );
          context.go('/items');
        }
      } finally {
        if (mounted) {
          setState(() => _isCapturing = false);
        }
      }
    }
  }

  void _retryPhoto() {
    setState(() {
      _capturedImageFile = null;
      _showPreview = false;
    });
  }

  void _toggleFlash() {
    unawaited(ref.read(cameraControllerProvider.notifier).toggleFlash());
  }

  void _switchCamera() {
    unawaited(_performCameraSwitch());
  }

  Future<void> _performCameraSwitch() async {
    final cameras = await ref.read(availableCamerasProvider.future);
    await ref.read(cameraControllerProvider.notifier).switchCamera(cameras);
  }

  @override
  Widget build(BuildContext context) {
    final cameraState = ref.watch(cameraControllerProvider);
    final flashMode = ref.watch(flashModeProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Camera preview
          if (cameraState.isInitialized && cameraState.controller != null)
            CameraPreview(cameraState.controller!)
          else if (cameraState.error != null && !Platform.isMacOS)
            Center(
              child: Text(
                cameraState.error!,
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
            )
          else
            const Center(
              child: Text('CAMERA READY', style: TextStyle(color: Colors.white, letterSpacing: 2, fontWeight: FontWeight.bold)),
            ),

          // Preview overlay with Retake/Continue buttons
          if (_showPreview && _capturedImageFile != null)
            Positioned.fill(
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.3),
                child: SafeArea(
                  child: Column(
                    children: [
                      const Spacer(),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.file(
                          _capturedImageFile!,
                          fit: BoxFit.cover,
                          width: MediaQuery.of(context).size.width * 0.8,
                          height: 250,
                        ),
                      ),
                      const Spacer(),
                      Padding(
                        padding: const EdgeInsets.all(32),
                        child: Wrap(
                          spacing: 24,
                          runSpacing: 16,
                          alignment: WrapAlignment.center,
                          children: [
                            ElevatedButton.icon(
                              onPressed: _retryPhoto,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retake'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.grey,
                                foregroundColor: Colors.white,
                                minimumSize: const Size(120, 48),
                              ),
                            ),
                            ElevatedButton.icon(
                              onPressed: _proceedWithImage,
                              icon: const Icon(Icons.check),
                              label: const Text('Continue'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.accentGreen,
                                foregroundColor: Colors.white,
                                minimumSize: const Size(120, 48),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Top controls
          if (!_showPreview)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _IconButton(
                      icon: flashMode == FlashMode.off
                          ? Icons.flash_off
                          : Icons.flash_on,
                      onPressed: _toggleFlash,
                    ),
                    _IconButton(
                      icon: Icons.flip_camera_android,
                      onPressed: _switchCamera,
                    ),
                  ],
                ),
              ),
            ),

          // Bottom capture button and gallery button
          if (!_showPreview)
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 40),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      const SizedBox(width: 48), // Spacer to balance
                      _CaptureButton(
                        onPressed: _capturePhoto,
                        isCapturing: _isCapturing,
                      ),
                      _IconButton(
                        icon: Icons.photo_library_outlined,
                        onPressed: _pickFromGallery,
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Close button
          if (!_showPreview)
            SafeArea(
              child: Align(
                alignment: Alignment.topLeft,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: _IconButton(
                    icon: Icons.close,
                    onPressed: () => context.pop(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  const _IconButton({required this.icon, required this.onPressed});
  final IconData icon; final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48, height: 48,
      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.4), shape: BoxShape.circle),
      child: IconButton(icon: Icon(icon, color: Colors.white), onPressed: onPressed, iconSize: 24, padding: EdgeInsets.zero),
    );
  }
}

class _CaptureButton extends StatelessWidget {
  const _CaptureButton({required this.onPressed, required this.isCapturing});
  final VoidCallback onPressed; final bool isCapturing;
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: const Key('shutter-button'),
      onTap: isCapturing ? null : onPressed,
      child: Container(
        width: 80, height: 80,
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 4)),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Container(
            decoration: BoxDecoration(color: isCapturing ? AppTheme.accentGreen : Colors.white, shape: BoxShape.circle),
            child: isCapturing
                ? const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Icon(Icons.camera_alt, color: Colors.black, size: 32),
          ),
        ),
      ),
    );
  }
}
