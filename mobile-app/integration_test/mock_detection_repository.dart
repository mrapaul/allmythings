import 'dart:io';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:mocktail/mocktail.dart';

class MockDetectionRepository extends Mock implements DetectionRepository {
  @override
  Future<DetectionResult> detectObjects(File imageFile) async {
    // Simulate API delay
    await Future.delayed(const Duration(seconds: 2));
    
    return DetectionResult(
      detections: [
        DetectedObject(
          boxIndex: 0,
          label: 'Mock Sofa',
          category: 'Furniture',
          confidence: 0.99,
          boundingBox: const BoundingBox(x: 0.1, y: 0.1, width: 0.8, height: 0.8),
        ),
      ],
      processingTimeMs: 2000,
      detector: 'mock',
      classifier: 'mock',
    );
  }
}
