import 'package:all_my_things/domain/models/detected_object.dart';

final sampleDetectedObject = DetectedObject(
  boxIndex: 0,
  label: 'IKEA BILLY bookcase',
  category: 'living room furniture',
  confidence: 0.92,
  boundingBox: BoundingBox(x: 0.1, y: 0.05, width: 0.25, height: 0.85),
  brand: 'IKEA',
  model: 'BILLY',
  colors: ['birch', 'white'],
  materials: ['particleboard', 'veneer'],
  condition: 'good',
  estimatedValue: ValueRange(low: 40, high: 70),
  description: 'Standard IKEA bookcase with 5 adjustable shelves',
);

final sampleDetectedObject2 = DetectedObject(
  boxIndex: 1,
  label: 'Samsung 55" QLED TV',
  category: 'electronics',
  confidence: 0.88,
  boundingBox: BoundingBox(x: 0.4, y: 0.1, width: 0.5, height: 0.35),
  brand: 'Samsung',
  model: 'QN55Q80C',
  colors: ['black'],
  materials: ['plastic', 'glass'],
  condition: 'excellent',
  estimatedValue: ValueRange(low: 600, high: 900),
  description: '55 inch QLED smart TV mounted on wall',
);

final sampleDetectedObjectMinimal = DetectedObject(
  boxIndex: 2,
  label: 'Wooden dining table',
  category: 'dining room furniture',
  confidence: 0.75,
  boundingBox: BoundingBox(x: 0.2, y: 0.3, width: 0.6, height: 0.4),
);

// Multiple detections for testing detection results screen
final sampleDetections = [sampleDetectedObject, sampleDetectedObject2];
