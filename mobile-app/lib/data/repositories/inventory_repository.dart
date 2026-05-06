import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/domain/models/scene_observation.dart' as wire;
import 'package:drift/drift.dart';

/// Repository for inventory items in local database.
///
/// §5.3 v6: every itemId is a TEXT sceneId. ``createPendingItem`` mints
/// a "pending-..." placeholder; the real sceneId from cross_frame_dedup
/// can rename via [renameItem] once the pipeline-service returns its
/// SceneObservation.
class InventoryRepository {
  InventoryRepository(this._database);
  final AppDatabase _database;
  final Random _rng = Random.secure();

  /// Generate a placeholder ID for a pending item before the pipeline-
  /// service returns a real sceneId. Format: "pending-{epochMicros}-{rand}".
  String _pendingId() {
    final ts = DateTime.now().microsecondsSinceEpoch;
    final rand = _rng.nextInt(1 << 32).toRadixString(16).padLeft(8, '0');
    return 'pending-$ts-$rand';
  }

  /// Create a new inventory item in pending state. Returns the placeholder
  /// id; rename via [renameItem] when the pipeline returns the sceneId.
  Future<String> createPendingItem({
    required String photoPath,
    required String thumbnailPath,
  }) async {
    final id = _pendingId();
    final companion = InventoryItemsCompanion.insert(
      id: id,
      photoPath: photoPath,
      thumbnailPath: thumbnailPath,
      detectionData: '{}',
      status: const Value('pending'),
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    await _database.into(_database.inventoryItems).insert(companion);
    return id;
  }

  /// Rename an item — used to swap the placeholder pending id for the
  /// real sceneId once cross_frame_dedup returns. Cascades to labels.
  Future<void> renameItem({
    required String fromId,
    required String toId,
  }) async {
    if (fromId == toId) return;
    await _database.transaction(() async {
      final existing = await getItemById(fromId);
      if (existing == null) return;
      await _database.into(_database.inventoryItems).insert(
            InventoryItemsCompanion.insert(
              id: toId,
              photoPath: existing.photoPath,
              thumbnailPath: existing.thumbnailPath,
              serverPhotoUrl: Value(existing.serverPhotoUrl),
              detectionData: existing.detectionData,
              status: Value(existing.status),
              isFlagged: Value(existing.isFlagged),
              createdAt: existing.createdAt,
              updatedAt: DateTime.now(),
            ),
          );
      await (_database.update(_database.labels)
            ..where((t) => t.itemId.equals(fromId)))
          .write(LabelsCompanion(itemId: Value(toId)));
      await (_database.delete(_database.inventoryItems)
            ..where((t) => t.id.equals(fromId)))
          .go();
    });
  }

  /// Update item status and detection data
  Future<void> updateItemStatus({
    required String itemId,
    required String status,
    String? detectionData,
    bool? isFlagged,
  }) async {
    final companion = InventoryItemsCompanion(
      status: Value(status),
      updatedAt: Value(DateTime.now()),
      detectionData:
          detectionData != null ? Value(detectionData) : const Value.absent(),
      isFlagged: isFlagged != null ? Value(isFlagged) : const Value.absent(),
    );
    await (_database.update(_database.inventoryItems)
          ..where((t) => t.id.equals(itemId)))
        .write(companion);
  }

  /// Update item thumbnail path
  Future<void> updateThumbnail(String itemId, String thumbnailPath) async {
    await (_database.update(_database.inventoryItems)
          ..where((t) => t.id.equals(itemId)))
        .write(InventoryItemsCompanion(thumbnailPath: Value(thumbnailPath)));
  }

  /// Extract labels from a DetectionResult
  List<LabelEntry> extractLabelsFromResult(DetectionResult result) {
    final labels = <LabelEntry>[];
    for (final detection in result.detections) {
      labels.add(LabelEntry('type', detection.label));
      if (detection.category.isNotEmpty &&
          detection.category != detection.label) {
        labels.add(LabelEntry('category', detection.category));
      }
      if (detection.brand != null) {
        labels.add(LabelEntry('brand', detection.brand!));
      }
      if (detection.model != null) {
        labels.add(LabelEntry('model', detection.model!));
      }
      for (final color in detection.colors) {
        labels.add(LabelEntry('color', color));
      }
      for (final material in detection.materials) {
        labels.add(LabelEntry('material', material));
      }
      if (detection.condition != null) {
        labels.add(LabelEntry('condition', detection.condition!));
      }
      if (detection.description != null) {
        labels.add(LabelEntry('description', detection.description!));
      }
      for (final tag in detection.searchTags) {
        labels.add(LabelEntry('tag', tag));
      }
    }
    return labels;
  }

  /// Replace all labels for an item with a new set
  Future<void> updateItemLabels(String itemId, List<LabelEntry> newLabels) async {
    await _database.transaction(() async {
      await (_database.delete(_database.labels)
            ..where((t) => t.itemId.equals(itemId)))
          .go();
      for (final label in newLabels) {
        await _database.into(_database.labels).insert(
              LabelsCompanion.insert(
                itemId: itemId,
                key: label.key,
                value: label.value,
                createdAt: DateTime.now(),
              ),
            );
      }
      await (_database.update(_database.inventoryItems)
            ..where((t) => t.id.equals(itemId)))
          .write(InventoryItemsCompanion(updatedAt: Value(DateTime.now())));
    });
  }

  /// Save a detected object as an inventory item with extracted labels
  /// (legacy path, kept for the pre-burst single-frame flow).
  Future<String> saveDetection({
    required String photoPath,
    required String thumbnailPath,
    required DetectedObject detection,
  }) async {
    final id = _pendingId();
    final detectionJson = jsonEncode(detection.toJson());
    await _database.into(_database.inventoryItems).insert(
          InventoryItemsCompanion.insert(
            id: id,
            photoPath: photoPath,
            thumbnailPath: thumbnailPath,
            detectionData: detectionJson,
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );
    final labels = _extractLabels(detection);
    for (final entry in labels) {
      await _database.into(_database.labels).insert(
            LabelsCompanion.insert(
              itemId: id,
              key: entry.key,
              value: entry.value,
              confidence: Value(detection.confidence),
              createdAt: DateTime.now(),
            ),
          );
    }
    return id;
  }

  /// Extract all VLM fields as key-value label pairs
  List<LabelEntry> _extractLabels(DetectedObject detection) {
    final labels = <LabelEntry>[];
    labels.add(LabelEntry('type', detection.label));
    if (detection.category.isNotEmpty && detection.category != detection.label) {
      labels.add(LabelEntry('type', detection.category));
    }
    if (detection.brand != null) {
      labels.add(LabelEntry('brand', detection.brand!));
    }
    if (detection.model != null) {
      labels.add(LabelEntry('model', detection.model!));
    }
    for (final color in detection.colors) {
      labels.add(LabelEntry('color', color));
    }
    for (final material in detection.materials) {
      labels.add(LabelEntry('material', material));
    }
    if (detection.condition != null) {
      labels.add(LabelEntry('condition', detection.condition!));
    }
    if (detection.description != null) {
      labels.add(LabelEntry('description', detection.description!));
    }
    for (final tag in detection.searchTags) {
      labels.add(LabelEntry('tag', tag));
    }
    return labels;
  }

  /// Get all inventory items
  Future<List<InventoryItem>> getAllItems() async {
    return (_database.select(_database.inventoryItems)
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
        .get();
  }

  /// Get item by ID
  Future<InventoryItem?> getItemById(String id) async {
    return (_database.select(_database.inventoryItems)
          ..where((t) => t.id.equals(id)))
        .getSingleOrNull();
  }

  /// Delete an item and its labels (cascades via FK).
  Future<void> deleteItem(String itemId) async {
    await _database.transaction(() async {
      await (_database.delete(_database.labels)
            ..where((t) => t.itemId.equals(itemId)))
          .go();
      await (_database.delete(_database.inventoryItems)
            ..where((t) => t.id.equals(itemId)))
          .go();
    });
  }

  /// Get labels for item
  Future<List<Label>> getLabelsForItem(String itemId) async {
    return (_database.select(_database.labels)
          ..where((t) => t.itemId.equals(itemId))
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)]))
        .get();
  }

  /// Search items using FTS
  Future<List<InventoryItem>> searchItems(String query) async {
    if (query.trim().isEmpty) return [];
    return _database.searchItems(query);
  }

  /// Section-08 §7: persist a SceneObservation to the v6 schema in one
  /// transaction. Idempotent on sceneId — re-persisting the same scene
  /// replaces the prior rows rather than duplicating them. Writes:
  ///   1 inventory_items row (id = sceneId)
  ///   1 scenes row
  ///   N detections rows
  ///   N + (alternates summed) detection_labels rows
  Future<void> persistScene({
    required wire.SceneObservation observation,
    required String photoPath,
    required String thumbnailPath,
    String? captureSessionId,
    String? serverPhotoUrl,
  }) async {
    final now = DateTime.now();
    final sceneId = observation.sceneId;

    await _database.transaction(() async {
      // Drop any prior rows for this sceneId so re-persists are
      // idempotent (FK cascades aren't on by default for our schema).
      final priorDetIds = await (_database.select(_database.detections)
            ..where((t) => t.sceneId.equals(sceneId)))
          .map((d) => d.id)
          .get();
      if (priorDetIds.isNotEmpty) {
        await (_database.delete(_database.detectionLabels)
              ..where((t) => t.detectionId.isIn(priorDetIds)))
            .go();
      }
      await (_database.delete(_database.detections)
            ..where((t) => t.sceneId.equals(sceneId)))
          .go();
      await (_database.delete(_database.scenes)
            ..where((t) => t.id.equals(sceneId)))
          .go();
      await (_database.delete(_database.inventoryItems)
            ..where((t) => t.id.equals(sceneId)))
          .go();

      // Inventory item — id IS the sceneId. Status reflects flagged.
      await _database.into(_database.inventoryItems).insert(
            InventoryItemsCompanion.insert(
              id: sceneId,
              photoPath: photoPath,
              thumbnailPath: thumbnailPath,
              serverPhotoUrl: Value(serverPhotoUrl),
              detectionData: jsonEncode(observation.toJson()),
              status: Value(observation.flagged ? 'flagged' : 'completed'),
              isFlagged: Value(observation.flagged),
              createdAt: now,
              updatedAt: now,
            ),
          );

      await _database.into(_database.scenes).insert(
            ScenesCompanion.insert(
              id: sceneId,
              captureSessionId: captureSessionId ?? sceneId,
              agreementCoverage: Value(observation.agreementCoverage),
              agreementPrecision: Value(observation.agreementPrecision),
              selfDiagnosisTriggered:
                  Value(observation.selfDiagnosisTriggered),
              rerunDepth: Value(observation.rerunDepth),
              flagReason: Value(observation.flagReason),
              createdAt: now,
            ),
          );

      for (final det in observation.detections) {
        Uint8List? embed;
        final b64 = det.cropEmbeddingB64;
        if (b64 != null && b64.isNotEmpty) {
          try {
            final bytes = base64Decode(b64);
            // Schema CHECK enforces 768 bytes; only persist if it matches
            // so we never blow up the transaction with a constraint error.
            if (bytes.length == 768) {
              embed = Uint8List.fromList(bytes);
            }
          } on FormatException {
            embed = null;
          }
        }
        Uint8List? mask;
        final mb64 = det.maskRleB64;
        if (mb64 != null && mb64.isNotEmpty) {
          try {
            mask = Uint8List.fromList(base64Decode(mb64));
          } on FormatException {
            mask = null;
          }
        }

        await _database.into(_database.detections).insert(
              DetectionsCompanion.insert(
                id: det.id,
                sceneId: sceneId,
                bbox: jsonEncode(det.bbox.toJson()),
                maskRle: Value(mask),
                cropEmbeddingI8: Value(embed),
                agreementScore: Value(det.agreementScore),
                contributingSignals: Value(jsonEncode(
                  det.contributingSignals.map((s) => s.toJson()).toList(),
                )),
                vlmStructuredAttributes:
                    Value(jsonEncode(det.vlmStructuredAttributes)),
                primaryLabel: det.primaryLabel,
                confidence: Value(det.confidence),
              ),
            );

        // Primary label first — denormalised so FTS5 over detection_labels
        // works without indexing JSON paths.
        await _database.into(_database.detectionLabels).insert(
              DetectionLabelsCompanion.insert(
                detectionId: det.id,
                label: det.primaryLabel,
                confidence: Value(det.confidence),
                isPrimary: const Value(true),
              ),
            );
        for (final alt in det.alternateLabels) {
          await _database.into(_database.detectionLabels).insert(
                DetectionLabelsCompanion.insert(
                  detectionId: det.id,
                  label: alt.label,
                  confidence: Value(alt.confidence),
                  isPrimary: const Value(false),
                ),
              );
        }
      }
    });
  }

  /// Get inventory statistics
  Future<InventoryStats> getStats() async {
    final itemCount = await (_database.selectOnly(_database.inventoryItems)
          ..addColumns([_database.inventoryItems.id.count()]))
        .map((row) => row.read(_database.inventoryItems.id.count()) ?? 0)
        .getSingle();
    final labelCount = await (_database.selectOnly(_database.labels)
          ..addColumns([_database.labels.id.count()]))
        .map((row) => row.read(_database.labels.id.count()) ?? 0)
        .getSingle();
    final lastItem = await (_database.select(_database.inventoryItems)
          ..orderBy([(t) => OrderingTerm.desc(t.createdAt)])
          ..limit(1))
        .getSingleOrNull();
    final allLabels = await _database.select(_database.labels).get();
    final uniqueLabels = allLabels.map((l) => l.value).toSet().length;
    return InventoryStats(
      totalItems: itemCount,
      totalLabels: labelCount,
      totalCategories: uniqueLabels,
      lastCaptured: lastItem?.createdAt,
    );
  }
}

/// Simple key-value pair for label extraction
class LabelEntry {
  LabelEntry(this.key, this.value);
  final String key;
  final String value;
}

/// Inventory statistics
class InventoryStats {
  InventoryStats({
    required this.totalItems,
    required this.totalLabels,
    required this.totalCategories,
    this.lastCaptured,
  });
  final int totalItems;
  final int totalLabels;
  final int totalCategories;
  final DateTime? lastCaptured;
}
