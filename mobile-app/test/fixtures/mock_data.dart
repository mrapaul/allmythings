import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/detection_response.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/ensemble_metrics.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:flutter/material.dart';

/// Factory class for creating consistent test fixtures across the app
class MockDataFactory {
  // Detection fixtures
  static BoundingBox createBoundingBox({
    double x = 0.1,
    double y = 0.2,
    double width = 0.3,
    double height = 0.4,
  }) {
    return BoundingBox(x: x, y: y, width: width, height: height);
  }

  static EnsembleDetails createEnsembleDetails({
    int providersUsed = 2,
    int providerAgreement = 2,
    String labelConsensus = 'test_label',
    Map<VisionProvider, double>? confidenceByProvider,
  }) {
    return EnsembleDetails(
      providersUsed: providersUsed,
      providerAgreement: providerAgreement,
      labelConsensus: labelConsensus,
      confidenceByProvider: confidenceByProvider ?? {
        VisionProvider.google: 0.95,
        VisionProvider.aws: 0.92,
      },
    );
  }

  static AlternativeLabel createAlternativeLabel({
    String label = 'alternative_label',
    double confidence = 0.8,
    VisionProvider provider = VisionProvider.google,
  }) {
    return AlternativeLabel(
      label: label,
      confidence: confidence,
      provider: provider,
    );
  }

  static Detection createDetection({
    String? id,
    String label = 'lamp',
    double confidence = 0.95,
    BoundingBox? boundingBox,
    EnsembleDetails? ensembleDetails,
    List<AlternativeLabel>? alternativeLabels,
  }) {
    return Detection(
      id: id ?? 'detection_${DateTime.now().millisecondsSinceEpoch}',
      label: label,
      confidence: confidence,
      boundingBox: boundingBox ?? createBoundingBox(),
      ensembleDetails: ensembleDetails ?? createEnsembleDetails(),
      alternativeLabels: alternativeLabels ?? [
        createAlternativeLabel(label: 'light', confidence: 0.85),
        createAlternativeLabel(label: 'fixture', confidence: 0.75),
      ],
    );
  }

  static EnsembleMetrics createEnsembleMetrics({
    double averageConfidence = 0.93,
    int totalDetections = 5,
  }) {
    return EnsembleMetrics(
      averageConfidence: averageConfidence,
      totalDetections: totalDetections,
    );
  }

  static DetectionResponse createDetectionResponse({
    List<Detection>? detections,
    EnsembleMetrics? ensembleMetrics,
  }) {
    return DetectionResponse(
      detections: detections ?? [createDetection()],
      ensembleMetrics: ensembleMetrics ?? createEnsembleMetrics(),
    );
  }

  // Database fixtures
  static InventoryItem createInventoryItem({
    int? id,
    String label = 'lamp',
    String? imagePath,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? location,
  }) {
    return InventoryItem(
      id: id,
      label: label,
      imagePath: imagePath ?? '/tmp/test_image.jpg',
      createdAt: createdAt ?? DateTime.now(),
      updatedAt: updatedAt ?? DateTime.now(),
      location: location,
    );
  }

  static Label createLabel({
    int? id,
    String name = 'lamp',
    int frequency = 1,
  }) {
    return Label(
      id: id,
      name: name,
      frequency: frequency,
    );
  }

  // List fixtures
  static List<Detection> createDetections(int count) {
    return List.generate(
      count,
      (index) => createDetection(
        label: 'object_$index',
        confidence: 0.9 - (index * 0.05),
      ),
    );
  }

  static List<InventoryItem> createInventoryItems(int count) {
    return List.generate(
      count,
      (index) => createInventoryItem(
        id: index + 1,
        label: 'item_$index',
        location: index % 2 == 0 ? 'bedroom' : 'living_room',
      ),
    );
  }

  // Edge case fixtures
  static Detection createDetectionWithLowConfidence() {
    return createDetection(
      label: 'uncertain_object',
      confidence: 0.45,
      ensembleDetails: createEnsembleDetails(
        providerAgreement: 1,
        confidenceByProvider: {
          VisionProvider.google: 0.5,
          VisionProvider.aws: 0.4,
        },
      ),
    );
  }

  static Detection createDetectionAtBoundary() {
    return createDetection(
      label: 'edge_object',
      boundingBox: createBoundingBox(x: 0, y: 0, width: 0.1, height: 0.1),
    );
  }

  static Detection createDetectionFullWidth() {
    return createDetection(
      label: 'wide_object',
      boundingBox: createBoundingBox(x: 0, y: 0.3, width: 1),
    );
  }

  // Multiple detections
  static DetectionResponse createDetectionResponseWithMultipleObjects() {
    return createDetectionResponse(
      detections: [
        createDetection(confidence: 0.95),
        createDetection(label: 'chair', confidence: 0.92),
        createDetection(label: 'table', confidence: 0.88),
      ],
      ensembleMetrics: createEnsembleMetrics(
        averageConfidence: 0.92,
        totalDetections: 3,
      ),
    );
  }
}
