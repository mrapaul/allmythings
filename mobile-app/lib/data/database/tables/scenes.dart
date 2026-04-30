import 'package:drift/drift.dart';

/// §5.3 scenes — one row per dedup'd burst capture.
@DataClassName('Scene')
class Scenes extends Table {
  /// Stable scene ID (from cross_frame_dedup's SceneObservation.sceneId).
  TextColumn get id => text()();

  /// Capture-session bucket — multiple bursts in one session share this.
  TextColumn get captureSessionId => text()();

  /// Mean(1{score>=2}) over the scene's detections (§6.3).
  RealColumn get agreementCoverage => real().withDefault(const Constant(0.0))();

  /// Mean(1{score>=3}).
  RealColumn get agreementPrecision => real().withDefault(const Constant(0.0))();

  BoolColumn get selfDiagnosisTriggered =>
      boolean().withDefault(const Constant(false))();

  IntColumn get rerunDepth => integer().withDefault(const Constant(0))();

  /// One of: empty_detection_set / single_source_run /
  /// diagnosis_budget_exhausted / assemble_failed.
  TextColumn get flagReason => text().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};

  @override
  List<String> get customConstraints => [
        'CHECK(agreement_coverage >= 0.0 AND agreement_coverage <= 1.0)',
        'CHECK(agreement_precision >= 0.0 AND agreement_precision <= 1.0)',
        'CHECK(rerun_depth >= 0)',
      ];
}
