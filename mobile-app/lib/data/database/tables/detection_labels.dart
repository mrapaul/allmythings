import 'package:all_my_things/data/database/tables/detections.dart';
import 'package:drift/drift.dart';

/// §5.3 detection_labels — denormalised primary + alternate labels per
/// detection so FTS5 can index them directly (Drift's FTS5 doesn't index
/// JSON paths).
@DataClassName('DetectionLabel')
class DetectionLabels extends Table {
  IntColumn get id => integer().autoIncrement()();

  TextColumn get detectionId => text().references(Detections, #id)();

  TextColumn get label => text()();

  RealColumn get confidence => real().withDefault(const Constant(0.0))();

  /// True for the cluster's primary label, false for alternates.
  BoolColumn get isPrimary => boolean().withDefault(const Constant(false))();

  @override
  List<String> get customConstraints => [
        'CHECK(length(trim(label)) > 0)',
        'CHECK(confidence >= 0.0 AND confidence <= 1.0)',
      ];
}
