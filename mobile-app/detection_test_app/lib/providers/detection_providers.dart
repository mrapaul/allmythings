import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/remote/api_client.dart';
import '../data/repositories/detection_repository.dart';
import '../models/detection.dart';

final detectionRepositoryProvider = Provider<DetectionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

final imageDetectionsProvider = FutureProvider.family<List<Detection>, File>((ref, imageFile) async {
  final detectionRepository = ref.watch(detectionRepositoryProvider);
  final result = await detectionRepository.detectObjects(imageFile);
  return result.fold(
    (error) => throw error,
    (response) => response.detections,
  );
});
