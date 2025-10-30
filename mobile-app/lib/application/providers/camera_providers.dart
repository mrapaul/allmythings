
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/services/photo_capture_service.dart';

/// Provider for photo capture service
final photoCaptureServiceProvider = Provider<PhotoCaptureService>((ref) {
  return PhotoCaptureService();
});
