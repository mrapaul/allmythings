import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/ensemble_metrics.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:all_my_things/domain/repositories/inventory_repository.dart';
import 'package:all_my_things/domain/services/image_picker_service/image_picker_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

// Mock repositories
class MockInventoryRepository extends Mock implements InventoryRepository {}

// Mock services
class MockImagePickerService extends Mock implements ImagePickerService {}

// Test data generators
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

// Helper function to initialize test environment
void setupTestEnvironment() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Register fallback values for custom types
  registerFallbackValue(createTestDetection());
  registerFallbackValue(createTestBoundingBox());
  registerFallbackValue(createTestEnsembleDetails());
  registerFallbackValue(createTestAlternativeLabel());
}

// Helper function to create a test widget with necessary providers
Widget createTestWidget(Widget child) {
  return MaterialApp(
    home: Scaffold(
      body: child,
    ),
  );
}
