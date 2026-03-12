import 'package:all_my_things/data/services/image_processing_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Provider for image processing service
final imageProcessingServiceProvider = Provider<ImageProcessingService>((ref) {
  return ImageProcessingService();
});
