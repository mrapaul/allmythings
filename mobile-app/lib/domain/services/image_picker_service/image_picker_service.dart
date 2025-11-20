import 'dart:io';

import 'package:flutter/material.dart';

abstract class ImagePickerService {
  Future<File?> pickImageFromGallery(BuildContext context);
  Future<File?> takePicture(BuildContext context);
}
