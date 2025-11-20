import 'dart:io';

import 'package:all_my_things/application/providers/camera_providers.dart';
import 'package:all_my_things/domain/models/quality_metrics.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:all_my_things/presentation/widgets/quality_feedback_widget.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

/// Camera capture screen with minimal icon-only UI
class CameraCaptureScreen extends ConsumerStatefulWidget {
  const CameraCaptureScreen({super.key});

  @override
  ConsumerState<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends ConsumerState<CameraCaptureScreen> {
  bool _isCapturing = false;
  QualityMetrics? _qualityMetrics;
  File? _capturedImageFile;
  bool _showQualityFeedback = false;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
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

    final cameraState = ref.read(cameraControllerProvider);
    final controller = cameraState.controller;

    if (controller == null || !cameraState.isInitialized) return;

    setState(() => _isCapturing = true);

    try {
      final image = await controller.takePicture();
      final directory = await getTemporaryDirectory();
      final filePath = '${directory.path}/${DateTime.now().millisecondsSinceEpoch}.jpg';
      final imageFile = await File(image.path).copy(filePath);

      // Analyze image quality - quality metrics will be fetched from API during detection
      // Store the image and show quality feedback widget

      if (mounted) {
        setState(() {
          _capturedImageFile = imageFile;
          _showQualityFeedback = true;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to capture photo: $e')),
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
      // Navigate to detection results screen
      context.push('/detection', extra: _capturedImageFile);

      // Reset state
      setState(() {
        _capturedImageFile = null;
        _qualityMetrics = null;
        _showQualityFeedback = false;
      });
    }
  }

  Future<void> _retryPhoto() async {
    setState(() {
      _capturedImageFile = null;
      _qualityMetrics = null;
      _showQualityFeedback = false;
    });
  }

  Future<void> _toggleFlash() async {
    await ref.read(cameraControllerProvider.notifier).toggleFlash();
  }

  Future<void> _switchCamera() async {
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
        children: [
          // Camera preview
          if (cameraState.isInitialized && cameraState.controller != null)
            SizedBox.expand(
              child: CameraPreview(cameraState.controller!),
            )
          else if (cameraState.error != null)
            Center(
              child: Text(
                cameraState.error!,
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
            )
          else
            const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),

          // Quality Feedback Modal (overlay when photo is captured)
          if (_showQualityFeedback && _capturedImageFile != null)
            Container(
              color: Colors.black.withValues(alpha: 0.3),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Captured image preview
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.file(
                            _capturedImageFile!,
                            fit: BoxFit.cover,
                            width: MediaQuery.of(context).size.width - 32,
                            height: 250,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Quality feedback widget
                  QualityFeedbackWidget(
                    qualityMetrics: _qualityMetrics,
                    onRetry: _retryPhoto,
                    isLoading: false,
                  ),
                  // Action buttons
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        ElevatedButton.icon(
                          onPressed: _retryPhoto,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Retake'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.grey,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 12,
                            ),
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: _proceedWithImage,
                          icon: const Icon(Icons.check),
                          label: const Text('Continue'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.accentGreen,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // Top controls
          if (!_showQualityFeedback)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Flash toggle
                    _IconButton(
                      icon: flashMode == FlashMode.off
                          ? Icons.flash_off
                          : Icons.flash_on,
                      onPressed: _toggleFlash,
                    ),

                    // Switch camera
                    _IconButton(
                      icon: Icons.flip_camera_android,
                      onPressed: _switchCamera,
                    ),
                  ],
                ),
              ),
            ),

          // Bottom capture button
          if (!_showQualityFeedback)
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 40),
                  child: _CaptureButton(
                    onPressed: _capturePhoto,
                    isCapturing: _isCapturing,
                  ),
                ),
              ),
            ),

          // Close button
          if (!_showQualityFeedback)
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

/// Icon-only button widget
class _IconButton extends StatelessWidget {
  const _IconButton({
    required this.icon,
    required this.onPressed,
  });

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.4),
        shape: BoxShape.circle,
      ),
      child: IconButton(
        icon: Icon(icon, color: Colors.white),
        onPressed: onPressed,
        iconSize: 24,
        padding: EdgeInsets.zero,
      ),
    );
  }
}

/// Capture button widget
class _CaptureButton extends StatelessWidget {
  const _CaptureButton({
    required this.onPressed,
    required this.isCapturing,
  });

  final VoidCallback onPressed;
  final bool isCapturing;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isCapturing ? null : onPressed,
      child: Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: Colors.white,
            width: 4,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Container(
            decoration: BoxDecoration(
              color: isCapturing ? AppTheme.accentGreen : Colors.white,
              shape: BoxShape.circle,
            ),
            child: isCapturing
                ? const Center(
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Icon(Icons.camera_alt, color: Colors.black, size: 32),
          ),
        ),
      ),
    );
  }
}
