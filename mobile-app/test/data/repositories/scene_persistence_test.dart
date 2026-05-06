// scene_persistence — InventoryRepository.persistScene must drop a
// SceneObservation into the v6 schema as: 1 inventory_items row, 1
// scenes row, N detections rows, M detection_labels rows.
import 'dart:convert';

import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/data/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase db;
  late InventoryRepository repo;

  setUp(() {
    db = AppDatabase.inMemory();
    repo = InventoryRepository(db);
  });

  tearDown(() async {
    await db.close();
  });

  SceneObservation buildScene({
    String sceneId = 'scene-1',
    int n = 2,
  }) {
    return SceneObservation(
      sceneId: sceneId,
      runId: 'run-1',
      frameIds: const ['f0', 'f1', 'f2'],
      detections: [
        for (var i = 0; i < n; i++)
          PipelineDetection(
            id: 'det-$sceneId-$i',
            bbox: const BBox(x: 0, y: 0, width: 1, height: 1),
            primaryLabel: 'thing-$i',
            alternateLabels: const [
              AlternateLabel(label: 'alt-a', confidence: 0.5),
              AlternateLabel(label: 'alt-b', confidence: 0.4),
            ],
            confidence: 0.7,
            agreementScore: 2,
          ),
      ],
      agreementCoverage: 0.8,
      agreementPrecision: 0.5,
      processingMs: 123,
    );
  }

  test('writes inventory_items + scenes + detections + denormalised labels',
      () async {
    final obs = buildScene(n: 2);
    await repo.persistScene(
      observation: obs,
      photoPath: '/tmp/p.webp',
      thumbnailPath: '/tmp/t.webp',
    );

    final items = await db.select(db.inventoryItems).get();
    expect(items, hasLength(1));
    expect(items.first.id, 'scene-1');
    expect(items.first.isFlagged, false);

    final scenes = await db.select(db.scenes).get();
    expect(scenes, hasLength(1));
    expect(scenes.first.id, 'scene-1');
    expect(scenes.first.agreementCoverage, 0.8);

    final dets = await db.select(db.detections).get();
    expect(dets, hasLength(2));
    final detIds = dets.map((d) => d.id).toList()..sort();
    expect(detIds, ['det-scene-1-0', 'det-scene-1-1']);

    // 2 detections × (1 primary + 2 alternates) = 6 label rows.
    final labels = await db.select(db.detectionLabels).get();
    expect(labels, hasLength(6));
    expect(labels.where((l) => l.isPrimary), hasLength(2));
  });

  test('flips inventory_items.isFlagged + writes flagReason on scenes',
      () async {
    final flagged = buildScene().copyWith(
      flagged: true,
      flagReason: 'empty_detection_set',
    );
    await repo.persistScene(
      observation: flagged,
      photoPath: '/tmp/p.webp',
      thumbnailPath: '/tmp/t.webp',
    );

    final items = await db.select(db.inventoryItems).get();
    expect(items.first.isFlagged, true);

    final scenes = await db.select(db.scenes).get();
    expect(scenes.first.flagReason, 'empty_detection_set');
  });

  test('is idempotent on the sceneId (re-persist replaces, never duplicates)',
      () async {
    final obs = buildScene(n: 1);
    await repo.persistScene(
      observation: obs,
      photoPath: '/tmp/p.webp',
      thumbnailPath: '/tmp/t.webp',
    );
    await repo.persistScene(
      observation: obs,
      photoPath: '/tmp/p.webp',
      thumbnailPath: '/tmp/t.webp',
    );

    expect(await db.select(db.inventoryItems).get(), hasLength(1));
    expect(await db.select(db.detections).get(), hasLength(1));
  });

  test('decodes cropEmbeddingB64 → 768B blob and respects the schema CHECK',
      () async {
    // 768 raw bytes (matches int8 DINOv2 vector). The repository must
    // base64-decode the wire field and store the BLOB as 768 bytes; the
    // schema's CHECK constraint enforces the length.
    final raw = List<int>.generate(768, (i) => i % 251);
    final embedB64 = base64Encode(raw);
    final obs = SceneObservation(
      sceneId: 's-emb',
      runId: 'r',
      detections: [
        PipelineDetection(
          id: 'd-emb',
          bbox: const BBox(x: 0, y: 0, width: 1, height: 1),
          primaryLabel: 'x',
          confidence: 1,
          cropEmbeddingB64: embedB64,
        ),
      ],
    );
    await repo.persistScene(
      observation: obs,
      photoPath: '/tmp/p',
      thumbnailPath: '/tmp/t',
    );

    final dets = await db.select(db.detections).get();
    expect(dets.first.cropEmbeddingI8, isNotNull);
    expect(dets.first.cropEmbeddingI8!.length, 768);
  });
}
