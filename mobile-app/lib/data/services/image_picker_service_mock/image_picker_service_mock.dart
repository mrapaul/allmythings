import 'dart:io';

import 'package:all_my_things/domain/services/image_picker_service/image_picker_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';

class MockImagePickerService implements ImagePickerService {
  @override
  Future<File?> pickImageFromGallery(BuildContext context) async {
    return _getMockImage();
  }

  @override
  Future<File?> takePicture(BuildContext context) async {
    return _getMockImage();
  }

  Future<File> _getMockImage() async {
    final byteData = await rootBundle.load('test_images/laptop.jpg');
    final buffer = byteData.buffer;
    final tempDir = await getTemporaryDirectory();
    final tempFile = File('${tempDir.path}/mock_image.jpg');
    await tempFile.writeAsBytes(
        buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes));
    return tempFile;
  }
}
