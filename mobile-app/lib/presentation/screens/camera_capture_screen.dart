import 'dart:async';
import 'dart:io';

import 'package:all_my_things/application/providers/camera_providers.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

/// Capture surface — restyled to the Disney+ palette but the camera /
/// shutter behavior stays exactly as before. Capturing pushes to
/// `/scene-review` with the captured File so the review screen runs
/// detection-and-confirm before anything is persisted.
class CameraCaptureScreen extends ConsumerStatefulWidget {
  const CameraCaptureScreen({super.key});

  @override
  ConsumerState<CameraCaptureScreen> createState() =>
      _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends ConsumerState<CameraCaptureScreen> {
  bool _isCapturing = false;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    unawaited(_initializeCamera());
  }

  Future<void> _initializeCamera() async {
    final cameras = await ref.read(availableCamerasProvider.future);
    if (cameras.isEmpty) return;
    final back = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );
    await ref.read(cameraControllerProvider.notifier).initialize(back);
  }

  Future<void> _capturePhoto() async {
    if (_isCapturing) return;

    if (Platform.isMacOS) {
      await _simulateCapture();
      return;
    }

    final state = ref.read(cameraControllerProvider);
    final controller = state.controller;
    if (controller == null || !state.isInitialized) return;

    setState(() => _isCapturing = true);
    try {
      final shot = await controller.takePicture();
      // iOS purges tmp/ aggressively; the captured frame must persist
      // through the 25-45s detection step + the user's review tap, so
      // we write it to applicationDocumentsDirectory/photos/ instead.
      final docs = await getApplicationDocumentsDirectory();
      final photosDir = Directory('${docs.path}/photos');
      await photosDir.create(recursive: true);
      final ts = DateTime.now().millisecondsSinceEpoch;
      final dest = File('${photosDir.path}/$ts-capture.jpg');
      await File(shot.path).copy(dest.path);
      await HapticFeedback.mediumImpact();
      if (!mounted) return;
      context.pushReplacement('/scene-review', extra: dest);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Capture error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  Future<void> _simulateCapture() async {
    setState(() => _isCapturing = true);
    try {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      final byteData =
          await rootBundle.load('assets/test_images/ai_interior.jpg');
      final docs = await getApplicationDocumentsDirectory();
      final photosDir = Directory('${docs.path}/photos');
      await photosDir.create(recursive: true);
      final file = File('${photosDir.path}/ai_interior.jpg');
      await file.writeAsBytes(
        byteData.buffer
            .asUint8List(byteData.offsetInBytes, byteData.lengthInBytes),
        flush: true,
      );
      if (!mounted) return;
      context.pushReplacement('/scene-review', extra: file);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Simulation failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  Future<void> _pickFromLibrary() async {
    final image = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (image == null || !mounted) return;
    context.pushReplacement('/scene-review', extra: File(image.path));
  }

  void _toggleFlash() {
    unawaited(ref.read(cameraControllerProvider.notifier).toggleFlash());
  }

  Future<void> _switchCamera() async {
    final cameras = await ref.read(availableCamerasProvider.future);
    await ref.read(cameraControllerProvider.notifier).switchCamera(cameras);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(cameraControllerProvider);
    final flash = ref.watch(flashModeProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (state.isInitialized && state.controller != null)
            CameraPreview(state.controller!)
          else if (state.error != null && !Platform.isMacOS)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  state.error!,
                  textAlign: TextAlign.center,
                  style: AppTypography.inter(size: 14, color: Colors.white70),
                ),
              ),
            )
          else
            Center(
              child: Text(
                'CAMERA READY',
                style: AppTypography.inter(
                  size: 12,
                  weight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: 2,
                ),
              ),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _GlassBtn(
                        icon: Icons.close_rounded,
                        onTap: () => context.pop(),
                      ),
                      _GlassBtn(
                        icon: flash == FlashMode.off
                            ? Icons.flash_off_rounded
                            : Icons.flash_on_rounded,
                        onTap: _toggleFlash,
                      ),
                    ],
                  ),
                  const Spacer(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _GlassBtn(
                        icon: Icons.image_outlined,
                        onTap: _pickFromLibrary,
                      ),
                      _Shutter(
                        isCapturing: _isCapturing,
                        onTap: _capturePhoto,
                      ),
                      _GlassBtn(
                        icon: Icons.flip_camera_android_rounded,
                        onTap: _switchCamera,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlassBtn extends StatelessWidget {
  const _GlassBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.4),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Center(child: Icon(icon, size: 22, color: Colors.white)),
        ),
      ),
    );
  }
}

class _Shutter extends StatelessWidget {
  const _Shutter({required this.isCapturing, required this.onTap});
  final bool isCapturing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return GestureDetector(
      key: const Key('shutter-button'),
      onTap: isCapturing ? null : onTap,
      child: SizedBox(
        width: 92,
        height: 92,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: p.glowPrimary.withValues(alpha: 0.45),
              ),
            ),
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 4),
              ),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: isCapturing
                          ? [p.success, p.success]
                          : [p.primary, const Color(0xFF4A3A9C)],
                    ),
                    shape: BoxShape.circle,
                  ),
                  child: isCapturing
                      ? const Center(
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          ),
                        )
                      : Icon(Icons.camera_alt_rounded,
                          size: 28, color: p.primaryForeground),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
