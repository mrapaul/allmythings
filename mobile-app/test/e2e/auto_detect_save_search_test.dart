import 'dart:convert';
import 'dart:io';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:all_my_things/domain/services/image_processing_service.dart';
import 'package:flutter_test/flutter_test.dart';

// A lightweight, deterministic detector used only for automated tests.
List<Detection> fakeDetectLivingRoomObjects() {
  return [
    const Detection(
      label: 'sofa',
      confidence: 0.95,
      boundingBox: BoundingBox(
        x: 0.15,
        y: 0.55,
        width: 0.6,
        height: 0.25,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 3,
        providerAgreement: 3,
        labelConsensus: 'sofa',
        confidenceByProvider: {
          VisionProvider.google: 0.95,
          VisionProvider.aws: 0.93,
          VisionProvider.tensorflow: 0.94,
        },
      ),
      alternativeLabels: [
        AlternativeLabel(
          label: 'couch',
          confidence: 0.88,
          provider: VisionProvider.google,
        ),
      ],
    ),
    const Detection(
      label: 'coffee table',
      confidence: 0.91,
      boundingBox: BoundingBox(
        x: 0.40,
        y: 0.70,
        width: 0.35,
        height: 0.18,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 3,
        providerAgreement: 2,
        labelConsensus: 'coffee table',
        confidenceByProvider: {
          VisionProvider.google: 0.90,
          VisionProvider.aws: 0.89,
          VisionProvider.tensorflow: 0.92,
        },
      ),
      alternativeLabels: [],
    ),
    const Detection(
      label: 'armchair',
      confidence: 0.88,
      boundingBox: BoundingBox(
        x: 0.08,
        y: 0.62,
        width: 0.22,
        height: 0.22,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 3,
        providerAgreement: 2,
        labelConsensus: 'armchair',
        confidenceByProvider: {
          VisionProvider.google: 0.87,
          VisionProvider.aws: 0.86,
          VisionProvider.tensorflow: 0.89,
        },
      ),
      alternativeLabels: [
        AlternativeLabel(
          label: 'chair',
          confidence: 0.80,
          provider: VisionProvider.aws,
        ),
      ],
    ),
    const Detection(
      label: 'floor lamp',
      confidence: 0.86,
      boundingBox: BoundingBox(
        x: 0.78,
        y: 0.58,
        width: 0.12,
        height: 0.35,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 2,
        providerAgreement: 2,
        labelConsensus: 'floor lamp',
      ),
      alternativeLabels: [],
    ),
    const Detection(
      label: 'plant',
      confidence: 0.84,
      boundingBox: BoundingBox(
        x: 0.10,
        y: 0.48,
        width: 0.15,
        height: 0.28,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 2,
        providerAgreement: 1,
        labelConsensus: 'plant',
      ),
      alternativeLabels: [],
    ),
    const Detection(
      label: 'window',
      confidence: 0.93,
      boundingBox: BoundingBox(
        x: 0.30,
        y: 0.10,
        width: 0.40,
        height: 0.35,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 2,
        providerAgreement: 2,
        labelConsensus: 'window',
      ),
      alternativeLabels: [],
    ),
    const Detection(
      label: 'rug',
      confidence: 0.82,
      boundingBox: BoundingBox(
        x: 0.35,
        y: 0.82,
        width: 0.50,
        height: 0.15,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 2,
        providerAgreement: 1,
        labelConsensus: 'rug',
      ),
      alternativeLabels: [],
    ),
    const Detection(
      label: 'artwork',
      confidence: 0.80,
      boundingBox: BoundingBox(
        x: 0.12,
        y: 0.18,
        width: 0.20,
        height: 0.20,
      ),
      ensembleDetails: EnsembleDetails(
        providersUsed: 2,
        providerAgreement: 1,
        labelConsensus: 'artwork',
      ),
      alternativeLabels: [],
    ),
  ];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('E2E: detect -> save -> list -> search', () {
    late AppDatabase db;
    late InventoryRepository repo;
    late File imageFile;
    late File thumbnailFile;

    setUp(() async {
      // Resolve test image path from env or default to user's provided path
      final envPath = Platform.environment['AI_TEST_IMAGE']?.trim();
      final defaultPath =
          '${Platform.environment['HOME']}/Downloads/Images/ai_interior.jpg';
      final path = (envPath != null && envPath.isNotEmpty)
          ? envPath
          : defaultPath;

      imageFile = File(path);
      if (!await imageFile.exists()) {
        // Skip this suite if image missing to keep CI green
        throw TestFailure(
          'Missing image at $path. Set AI_TEST_IMAGE env or place file there.',
        );
      }

      // Use a temp on-disk DB so file paths are realistic
      final tmpDir = Directory.systemTemp.createTempSync('all_my_things_e2e');
      final dbPath = File('${tmpDir.path}/home_inventory_e2e.db').path;
      db = AppDatabase.atPath(dbPath);
      repo = InventoryRepository(db);

      // Generate a thumbnail alongside the image
      final imageService = ImageProcessingService();
      final thumbResult = await imageService.generateThumbnail(imageFile);
      thumbResult.match(
        (l) => throw TestFailure('Failed to create thumbnail: $l'),
        (thumb) => thumbnailFile = thumb,
      );
    });

    tearDown(() async {
      await db.close();
    });

    test('pipeline saves detections and search finds them', () async {
      final detections = fakeDetectLivingRoomObjects();
      expect(detections, isNotEmpty);

      // Save each detection as an item
      for (final d in detections) {
        final res = await repo.createItem(
          photoPath: imageFile.path,
          thumbnailPath: thumbnailFile.path,
          detection: d,
        );
        res.match(
          (err) => fail('createItem failed: $err'),
          (id) => expect(id, greaterThan(0)),
        );
      }

      // Verify items are persisted
      final all = await repo.getAllItems();
      all.match(
        (err) => fail('getAllItems failed: $err'),
        (items) {
          expect(items.length, detections.length);
          // Ensure label text retrievable from row JSON
          final labels = items.map((it) {
            final map = jsonDecode(it.detectionData) as Map<String, dynamic>;
            return map['label'] as String? ?? '';
          }).toList();
          expect(labels, contains('sofa'));
          expect(labels, contains('coffee table'));
        },
      );

      // Search should find subset for queries
      final queries = [
        'sofa',
        'table',
        'lamp',
        'plant',
        'window',
        'rug',
        'art',
      ];
      for (final q in queries) {
        final sr = await repo.searchItems(q);
        sr.match(
          (err) => fail('searchItems("$q") failed: $err'),
          (items) => expect(items, isNotEmpty, reason: 'No match for "$q"'),
        );
      }
    });
  });
}
