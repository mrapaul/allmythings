import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:all_my_things/application/providers/database_provider.dart';
import 'package:all_my_things/application/providers/detection_api_provider.dart';
import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/providers/service_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Export InventoryStats from repository
export '../../data/repositories/inventory_repository.dart' show InventoryStats, LabelEntry;

/// Provider for inventory repository (async because databaseProvider is async)
final inventoryRepositoryProvider =
    FutureProvider<InventoryRepository>((ref) async {
  final database = await ref.watch(databaseProvider.future);
  return InventoryRepository(database);
});

/// Notifier for managing the list of inventory items
class InventoryListNotifier extends AsyncNotifier<List<InventoryItem>> {
  @override
  Future<List<InventoryItem>> build() async {
    final repository = await ref.watch(inventoryRepositoryProvider.future);
    return repository.getAllItems();
  }

  /// Start a background detection process for a captured image
  Future<void> processImageInBackground(File imageFile) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final imageService = ref.read(imageProcessingServiceProvider);
    
    // 1. Create a dummy initial thumbnail for the pending item
    final initialThumbnail = await imageService.generateThumbnail(
      imageFile,
      const BoundingBox(x: 0, y: 0, width: 1, height: 1),
    );

    // 2. Create the pending item in DB
    final itemId = await repository.createPendingItem(
      photoPath: imageFile.path,
      thumbnailPath: initialThumbnail.path,
    );

    // 3. Immediately refresh UI so user sees the "Processing" tile
    ref.invalidateSelf();

    // 4. Fire and forget the detection logic
    unawaited(_runBackgroundDetection(itemId, imageFile));
  }

  Future<void> _runBackgroundDetection(String itemId, File imageFile) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final imageService = ref.read(imageProcessingServiceProvider);

    // If the pipeline fails, the item is marked failed; the user can
    // re-trigger from the inventory feed.
    List<DetectedObject>? detections;
    String classifier = 'none';
    String detector = 'pipeline';
    int processingTimeMs = 0;

    try {
      final detectionRepository = ref.read(detectionRepositoryProvider);
      debugPrint('[DETECT] Calling Mac pipeline for item $itemId');
      final result = await detectionRepository.detectObjects(imageFile);
      debugPrint(
        '[DETECT] Pipeline returned ${result.detections.length} detections '
        'in ${result.processingTimeMs}ms',
      );
      if (result.detections.isNotEmpty) {
        detections = result.detections;
        detector = result.detector;
        classifier = result.classifier;
        processingTimeMs = result.processingTimeMs;
      }
    } catch (e) {
      debugPrint('[DETECT] pipeline call failed for item $itemId: $e');
    }

    try {
      if (detections == null || detections.isEmpty) {
        await repository.updateItemStatus(itemId: itemId, status: 'failed');
      } else {
        final bestDetection = detections.first;
        final finalThumbnail = await imageService.generateThumbnail(
          imageFile,
          bestDetection.boundingBox,
        );

        await repository.updateItemStatus(
          itemId: itemId,
          status: 'unconfirmed',
          detectionData: jsonEncode(detections.map((d) => d.toJson()).toList()),
        );

        final result = DetectionResult(
          detections: detections,
          detector: detector,
          classifier: classifier,
          processingTimeMs: processingTimeMs,
        );
        final labels = repository.extractLabelsFromResult(result);
        await repository.updateItemLabels(itemId, labels);

        await repository.updateThumbnail(itemId, finalThumbnail.path);
      }
    } catch (e) {
      await repository.updateItemStatus(itemId: itemId, status: 'failed');
      debugPrint('[DETECT] DB update failed for item $itemId: $e');
    } finally {
      ref.invalidateSelf();
      ref.invalidate(inventoryStatsProvider);
      ref.invalidate(itemLabelsProvider(itemId));
    }
  }

  /// Section-08 §9 / production: process a 3-frame burst through the
  /// SceneObservation path. Calls detection_repository.detectSceneBurst()
  /// (multipart with 1-3 parts, idempotency = sha256(concat(sha256(per-frame))))
  /// and persists the typed scene to the v6 schema.
  ///
  /// The first frame's path is used as the inventory item's representative
  /// photo (for thumbnail + feed display); the other frames are ephemeral
  /// uploads — the server keeps them under photoDir/photos/.
  Future<String?> processSceneBurstInBackground(List<File> burstFrames) async {
    if (burstFrames.isEmpty) return null;
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final imageService = ref.read(imageProcessingServiceProvider);

    final representative = burstFrames.first;
    final initialThumbnail = await imageService.generateThumbnail(
      representative,
      const BoundingBox(x: 0, y: 0, width: 1, height: 1),
    );

    SceneObservation? observation;
    try {
      final detectionApi = ref.read(detectionApiProvider);
      observation = await detectionApi.detectSceneBurst(burstFrames);
    } catch (e) {
      debugPrint('[DETECT-BURST] failed: $e');
    }

    if (observation == null) {
      // Fall back to single-frame path if the server didn't accept the
      // burst (defensive — keeps the inventory feed honest while the
      // 3-part rollout completes).
      await processImageInBackground(representative);
      return null;
    }

    try {
      await repository.persistScene(
        observation: observation,
        photoPath: representative.path,
        thumbnailPath: initialThumbnail.path,
      );
    } catch (e) {
      debugPrint('[DETECT-BURST] persist failed: $e');
    } finally {
      ref.invalidateSelf();
      ref.invalidate(inventoryStatsProvider);
    }
    return observation.sceneId;
  }

  /// Section-08 §9 (legacy single-frame variant): process a single
  /// captured image through the SceneObservation path. Kept for clients
  /// that haven't migrated to the burst path yet (e.g., gallery import).
  Future<String?> processSceneInBackground(File imageFile) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final imageService = ref.read(imageProcessingServiceProvider);

    // Best-effort initial thumbnail; replaced once we know the bbox.
    final initialThumbnail = await imageService.generateThumbnail(
      imageFile,
      const BoundingBox(x: 0, y: 0, width: 1, height: 1),
    );

    SceneObservation? observation;
    try {
      final detectionApi = ref.read(detectionApiProvider);
      observation = await detectionApi.detectScene(imageFile);
    } catch (e) {
      debugPrint('[DETECT-SCENE] failed: $e');
    }

    if (observation == null) {
      // Fall back to the legacy path if the scene endpoint isn't ready
      // server-side yet; keeps the inventory feed honest about failures.
      await processImageInBackground(imageFile);
      return null;
    }

    try {
      await repository.persistScene(
        observation: observation,
        photoPath: imageFile.path,
        thumbnailPath: initialThumbnail.path,
      );
    } catch (e) {
      debugPrint('[DETECT-SCENE] persist failed: $e');
    } finally {
      ref.invalidateSelf();
      ref.invalidate(inventoryStatsProvider);
    }
    return observation.sceneId;
  }

  /// Confirm an unconfirmed item after user review
  Future<void> confirmItem(String itemId) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    await repository.updateItemStatus(itemId: itemId, status: 'completed');
    
    // Invalidate everything related to this item to refresh UI
    ref.invalidateSelf();
    ref.invalidate(inventoryStatsProvider);
    ref.invalidate(inventoryItemProvider(itemId));
  }

  /// Legacy method for manual saves (if needed)
  Future<String> saveDetection({
    required String photoPath,
    required String thumbnailPath,
    required DetectedObject detection,
  }) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final itemId = await repository.saveDetection(
      photoPath: photoPath,
      thumbnailPath: thumbnailPath,
      detection: detection,
    );

    ref.invalidateSelf();
    return itemId;
  }

  /// Update labels for an item
  Future<void> updateLabels(String itemId, List<LabelEntry> labels) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    await repository.updateItemLabels(itemId, labels);
    
    ref.invalidate(itemLabelsProvider(itemId));
    ref.invalidateSelf();
  }
}

/// Provider for all inventory items
final inventoryItemsProvider =
    AsyncNotifierProvider<InventoryListNotifier, List<InventoryItem>>(
  InventoryListNotifier.new,
);

/// Provider for a single item by ID
final inventoryItemProvider =
    FutureProvider.family<InventoryItem?, String>((ref, itemId) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getItemById(itemId);
});

/// Provider for item labels
final itemLabelsProvider =
    FutureProvider.family<List<Label>, String>((ref, itemId) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getLabelsForItem(itemId);
});

/// Provider for search results
final searchResultsProvider =
    FutureProvider.family<List<InventoryItem>, String>((ref, query) async {
  if (query.trim().isEmpty) return [];

  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.searchItems(query);
});

/// Provider for inventory stats
final inventoryStatsProvider = FutureProvider<InventoryStats>((ref) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getStats();
});
