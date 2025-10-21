import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repositories/detection_repository.dart';
import '../../data/repositories/inventory_repository.dart';
import '../../data/remote/api_client.dart';
import '../../domain/services/photo_capture_service.dart';
import '../../domain/services/image_processing_service.dart';
import '../state/detection_state.dart';
import 'database_provider.dart';

/// Provider for detection repository
final detectionRepositoryProvider = Provider<DetectionRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DetectionRepository(apiClient);
});

/// Provider for inventory repository
final inventoryRepositoryProvider = Provider<InventoryRepository>((ref) {
  final database = ref.watch(databaseProvider);
  return InventoryRepository(database);
});

/// Provider for photo capture service
final photoCaptureServiceProvider = Provider<PhotoCaptureService>((ref) {
  return PhotoCaptureService();
});

/// Provider for image processing service
final imageProcessingServiceProvider = Provider<ImageProcessingService>((ref) {
  return ImageProcessingService();
});

/// State notifier for detection
class DetectionNotifier extends StateNotifier<DetectionState> {
  final DetectionRepository _detectionRepository;
  final InventoryRepository _inventoryRepository;
  final ImageProcessingService _imageProcessingService;

  DetectionNotifier(
    this._detectionRepository,
    this._inventoryRepository,
    this._imageProcessingService,
  ) : super(const DetectionState.initial());

  /// Detect objects and save to inventory
  Future<void> detectAndSave(File photoFile) async {
    state = const DetectionState.loading();

    // Generate thumbnail
    final thumbnailResult = await _imageProcessingService.generateThumbnail(photoFile);

    await thumbnailResult.fold(
      (failure) async {
        state = DetectionState.error(failure);
      },
      (thumbnailFile) async {
        // Detect objects
        final detectionResult = await _detectionRepository.detectObjects(photoFile);

        await detectionResult.fold(
          (failure) async {
            state = DetectionState.error(failure);
          },
          (response) async {
            // Save to inventory
            if (response.detections.isNotEmpty) {
              for (final detection in response.detections) {
                await _inventoryRepository.createItem(
                  photoPath: photoFile.path,
                  thumbnailPath: thumbnailFile.path,
                  detection: detection,
                );
              }
            }

            state = DetectionState.success(response);
          },
        );
      },
    );
  }

  /// Reset state
  void reset() {
    state = const DetectionState.initial();
  }
}

/// Provider for detection notifier
final detectionNotifierProvider =
    StateNotifierProvider<DetectionNotifier, DetectionState>((ref) {
  final detectionRepo = ref.watch(detectionRepositoryProvider);
  final inventoryRepo = ref.watch(inventoryRepositoryProvider);
  final imageProcessing = ref.watch(imageProcessingServiceProvider);

  return DetectionNotifier(detectionRepo, inventoryRepo, imageProcessing);
});
