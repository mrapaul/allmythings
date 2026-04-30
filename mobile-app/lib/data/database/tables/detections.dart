import 'package:all_my_things/data/database/tables/scenes.dart';
import 'package:drift/drift.dart';

/// §5.3 detections — one row per dedup'd object instance in a scene.
@DataClassName('Detection')
class Detections extends Table {
  /// Stable detection ID (from cross_frame_dedup's PipelineDetection.id).
  TextColumn get id => text()();

  /// FK → scenes.id.
  TextColumn get sceneId => text().references(Scenes, #id)();

  /// JSON: {x, y, width, height} in source-frame pixels.
  TextColumn get bbox => text()();

  /// Optional EfficientSAM mask (RLE-encoded bytes).
  BlobColumn get maskRle => blob().nullable()();

  /// 768-byte int8-quantised crop embedding (DINOv2 ViT-B/14, dequant via /127).
  BlobColumn get cropEmbeddingI8 => blob().nullable()();

  /// agreement_score ∈ {0..5} — how many independent signal classes corroborate.
  RealColumn get agreementScore => real().withDefault(const Constant(0.0))();

  /// JSON: list of {detector, frameId, rawConfidence}.
  TextColumn get contributingSignals => text().withDefault(const Constant('[]'))();

  /// JSON: VLM-derived structured attributes (may be {}).
  TextColumn get vlmStructuredAttributes =>
      text().withDefault(const Constant('{}'))();

  /// Chosen by agreement (not from a class list).
  TextColumn get primaryLabel => text()();

  /// Sigmoid-calibrated confidence ∈ [0, 1].
  RealColumn get confidence => real().withDefault(const Constant(0.0))();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<String> get customConstraints => [
        'CHECK(confidence >= 0.0 AND confidence <= 1.0)',
        'CHECK(length(crop_embedding_i8) IS NULL OR length(crop_embedding_i8) = 768)',
      ];
}
