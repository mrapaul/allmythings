import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:all_my_things/application/providers/database_provider.dart';
import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/providers/service_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/native/coreml_detector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod/src/providers/future_provider.dart';

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

  Future<void> _runBackgroundDetection(int itemId, File imageFile) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    final imageService = ref.read(imageProcessingServiceProvider);

    // Tier 1: CoreML on-device — always runs, used as fallback if Mac fails
    final coreMLBoxes = await CoreMLDetector.detect(imageFile);
    debugPrint('[DETECT] CoreML returned ${coreMLBoxes.length} boxes for item $itemId');

    List<DetectedObject>? detections;
    String classifier = 'none';
    String detector = 'coreml';
    int processingTimeMs = 0;

    // Tier 2: Mac deep pass — tries for rich attributes
    try {
      final detectionRepository = ref.read(detectionRepositoryProvider);
      debugPrint('[DETECT] Calling Mac API for item $itemId');
      final result = await detectionRepository.detectObjects(imageFile);
      debugPrint('[DETECT] Mac returned ${result.detections.length} detections in ${result.processingTimeMs}ms');

      if (result.detections.isNotEmpty) {
        detections = result.detections;
        detector = result.detector;
        classifier = result.classifier;
        processingTimeMs = result.processingTimeMs;
      }
    } catch (e) {
      debugPrint('[DETECT] Mac call failed for item $itemId: $e');
    }

    // Fallback: use CoreML boxes if Mac gave nothing
    if (detections == null && coreMLBoxes.isNotEmpty) {
      detections = coreMLBoxes.map(_coreMLBoxToDetectedObject).toList();
      classifier = 'offline';
      debugPrint('[DETECT] Using ${detections.length} CoreML boxes as fallback');
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

  DetectedObject _coreMLBoxToDetectedObject(CoreMLBox box) {
    return DetectedObject(
      boxIndex: box.boxIndex,
      label: box.label,
      category: 'object',
      confidence: box.confidence,
      boundingBox: BoundingBox(
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      ),
    );
  }

  /// Confirm an unconfirmed item after user review
  Future<void> confirmItem(int itemId) async {
    final repository = await ref.read(inventoryRepositoryProvider.future);
    await repository.updateItemStatus(itemId: itemId, status: 'completed');
    
    // Invalidate everything related to this item to refresh UI
    ref.invalidateSelf();
    ref.invalidate(inventoryStatsProvider);
    ref.invalidate(inventoryItemProvider(itemId));
  }

  /// Legacy method for manual saves (if needed)
  Future<int> saveDetection({
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
  Future<void> updateLabels(int itemId, List<LabelEntry> labels) async {
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
final FutureProviderFamily<InventoryItem?, int> inventoryItemProvider =
    FutureProvider.family<InventoryItem?, int>((ref, itemId) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getItemById(itemId);
});

/// Provider for item labels
final FutureProviderFamily<List<Label>, int> itemLabelsProvider =
    FutureProvider.family<List<Label>, int>((ref, itemId) async {
  final repository = await ref.watch(inventoryRepositoryProvider.future);
  return repository.getLabelsForItem(itemId);
});

/// Provider for search results
final FutureProviderFamily<List<InventoryItem>, String> searchResultsProvider =
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
