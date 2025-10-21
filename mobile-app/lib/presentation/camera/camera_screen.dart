import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../application/providers/detection_providers.dart';
import '../../application/providers/inventory_providers.dart';
import '../theme/app_theme.dart';

/// Instagram/TikTok-inspired camera screen
/// Full-screen, minimal, functional
class CameraScreen extends ConsumerStatefulWidget {
  const CameraScreen({super.key});

  @override
  ConsumerState<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends ConsumerState<CameraScreen> {
  bool _isProcessing = false;
  PermissionStatus? _cameraPermission;
  PermissionStatus? _photosPermission;

  @override
  void initState() {
    super.initState();
    _checkPermissions();
  }

  Future<void> _checkPermissions() async {
    final camera = await Permission.camera.status;
    final photos = await Permission.photos.status;

    setState(() {
      _cameraPermission = camera;
      _photosPermission = photos;
    });
  }

  Future<void> _requestCameraPermission() async {
    final status = await Permission.camera.request();
    setState(() {
      _cameraPermission = status;
    });

    if (status.isGranted) {
      _takePhoto();
    } else if (status.isPermanentlyDenied) {
      _showSettingsDialog();
    }
  }

  Future<void> _requestPhotosPermission() async {
    final status = await Permission.photos.request();
    setState(() {
      _photosPermission = status;
    });

    if (status.isGranted) {
      _pickFromGallery();
    } else if (status.isPermanentlyDenied) {
      _showSettingsDialog();
    }
  }

  void _showSettingsDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permission Required'),
        content: const Text(
          'This app needs camera and photo access to identify objects. '
          'Please enable permissions in Settings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              openAppSettings();
              Navigator.pop(context);
            },
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
  }

  Future<void> _takePhoto() async {
    if (_cameraPermission != PermissionStatus.granted) {
      await _requestCameraPermission();
      return;
    }

    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    );

    if (image != null) {
      await _processImage(File(image.path));
    }
  }

  Future<void> _pickFromGallery() async {
    if (_photosPermission != PermissionStatus.granted) {
      await _requestPhotosPermission();
      return;
    }

    final picker = ImagePicker();
    final image = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    );

    if (image != null) {
      await _processImage(File(image.path));
    }
  }

  Future<void> _processImage(File imageFile) async {
    setState(() {
      _isProcessing = true;
    });

    try {
      // Process image with detection API
      final notifier = ref.read(detectionNotifierProvider.notifier);
      await notifier.detectAndSave(imageFile);

      if (!mounted) return;

      // Check result
      final state = ref.read(detectionNotifierProvider);
      state.when(
        initial: () {},
        loading: () {},
        success: (response) {
          // Refresh inventory
          ref.invalidate(inventoryItemsProvider);

          // Show success and go back
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '${response.detections.length} item(s) added',
                style: const TextStyle(color: Colors.white),
              ),
              backgroundColor: AppTheme.accentGreen,
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 2),
            ),
          );

          // Navigate back to home
          Navigator.pop(context);
        },
        error: (failure) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(failure.message),
              backgroundColor: AppTheme.accentRed,
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
      );
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Main content
          if (_isProcessing)
            _buildProcessingView()
          else
            _buildCameraView(),

          // Top bar
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white, size: 28),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const Text(
                    'Add Items',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 48), // Balance the close button
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCameraView() {
    return Column(
      children: [
        const Spacer(),

        // Instructions
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 32, vertical: 24),
          child: Text(
            'Take a photo or choose from gallery\nWe\'ll identify objects and add them to your inventory',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white70,
              fontSize: 15,
              height: 1.4,
            ),
          ),
        ),

        const SizedBox(height: 40),

        // Camera button (large, center - like TikTok)
        GestureDetector(
          onTap: _takePhoto,
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
            child: Container(
              margin: const EdgeInsets.all(6),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
              ),
              child: const Icon(
                Icons.camera_alt,
                color: Colors.black,
                size: 32,
              ),
            ),
          ),
        ),

        const SizedBox(height: 16),
        const Text(
          'Take Photo',
          style: TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),

        const SizedBox(height: 48),

        // Gallery button
        GestureDetector(
          onTap: _pickFromGallery,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(
                color: Colors.white.withOpacity(0.3),
                width: 1,
              ),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.photo_library, color: Colors.white, size: 20),
                SizedBox(width: 8),
                Text(
                  'Choose from Gallery',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 80),
      ],
    );
  }

  Widget _buildProcessingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Animated loading indicator
          SizedBox(
            width: 80,
            height: 80,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              valueColor: AlwaysStoppedAnimation<Color>(
                AppTheme.accentGreen,
              ),
            ),
          ),
          const SizedBox(height: 32),
          const Text(
            'Identifying objects...',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'This may take a few seconds',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
