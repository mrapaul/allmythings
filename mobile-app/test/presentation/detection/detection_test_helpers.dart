import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/ensemble_metrics.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';

// Helper functions for detection tests
BoundingBox createTestBoundingBox({
  double x = 0.1,
  double y = 0.2,
  double width = 0.3,
  double height = 0.4,
}) {
  return BoundingBox(x: x, y: y, width: width, height: height);
}

EnsembleDetails createTestEnsembleDetails({
  int providersUsed = 2,
  int providerAgreement = 2,
  String labelConsensus = 'test',
  Map<VisionProvider, double>? confidenceByProvider,
}) {
  return EnsembleDetails(
    providersUsed: providersUsed,
    providerAgreement: providerAgreement,
    labelConsensus: labelConsensus,
    confidenceByProvider:
        confidenceByProvider ??
        {
          VisionProvider.google: 0.9,
          VisionProvider.aws: 0.85,
        },
  );
}

AlternativeLabel createTestAlternativeLabel({
  String label = 'alternative',
  double confidence = 0.8,
  VisionProvider provider = VisionProvider.google,
}) {
  return AlternativeLabel(
    label: label,
    confidence: confidence,
    provider: provider,
  );
}

Detection createTestDetection({
  String? id,
  String label = 'test',
  double confidence = 0.9,
  BoundingBox? boundingBox,
  EnsembleDetails? ensembleDetails,
  List<AlternativeLabel>? alternativeLabels,
}) {
  return Detection(
    id: id,
    label: label,
    confidence: confidence,
    boundingBox: boundingBox ?? createTestBoundingBox(),
    ensembleDetails: ensembleDetails ?? createTestEnsembleDetails(),
    alternativeLabels:
        alternativeLabels ??
        [
          createTestAlternativeLabel(),
        ],
  );
}

EnsembleMetrics createTestEnsembleMetrics({
  double averageConfidence = 0.9,
  int totalDetections = 1,
}) {
  return EnsembleMetrics(
    averageConfidence: averageConfidence,
    totalDetections: totalDetections,
  );
}

DetectionResponse createTestDetectionResponse({
  List<Detection>? detections,
  EnsembleMetrics? ensembleMetrics,
}) {
  return DetectionResponse(
    detections: detections ?? [createTestDetection()],
    ensembleMetrics: ensembleMetrics ?? createTestEnsembleMetrics(),
  );
}
