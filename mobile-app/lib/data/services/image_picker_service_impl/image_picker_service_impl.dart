import 'dart:io';

import 'package:all_my_things/domain/services/image_picker_service/image_picker_service.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Mobile implementation of image picker service
/// Uses native image picker and Go Router for camera navigation
class MobileImagePickerService implements ImagePickerService {
  final _picker = ImagePicker();

  @override
  Future<File?> pickImageFromGallery(BuildContext context) async {
    try {
      final pickedFile = await _picker.pickImage(source: ImageSource.gallery);
      if (pickedFile != null) {
        return File(pickedFile.path);
      }
    } catch (e) {
      print('Error picking image from gallery: $e');
    }
    return null;
  }

  @override
  Future<File?> takePicture(BuildContext context) async {
    // Camera capture is handled by CameraCaptureScreen via GoRouter
    // This service now only handles gallery picks
    return null;
  }
}
