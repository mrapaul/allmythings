import 'package:all_my_things/data/services/image_picker_service_impl/image_picker_service_impl.dart';
import 'package:all_my_things/data/services/image_picker_service_mock/image_picker_service_mock.dart';
import 'package:all_my_things/domain/services/image_picker_service/image_picker_service.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final imagePickerServiceProvider = Provider<ImagePickerService>((ref) {
  final platform = defaultTargetPlatform;

  if (platform == TargetPlatform.android || platform == TargetPlatform.iOS) {
    return MobileImagePickerService();
  } else {
    return MockImagePickerService();
  }
});
