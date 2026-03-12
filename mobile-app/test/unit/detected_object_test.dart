import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DetectedObject', () {
    test('fromJson should create a valid DetectedObject', () {
      final json = {
        'boxIndex': 0,
        'label': 'IKEA BILLY bookcase',
        'category': 'living room furniture',
        'confidence': 0.92,
        'boundingBox': {
          'x': 0.1,
          'y': 0.05,
          'width': 0.25,
          'height': 0.85,
        },
        'brand': 'IKEA',
        'model': 'BILLY',
        'colors': ['birch', 'white'],
        'materials': ['particleboard', 'veneer'],
        'condition': 'good',
        'estimatedValue': {'low': 40.0, 'high': 70.0},
        'description': 'Standard IKEA bookcase',
      };

      final object = DetectedObject.fromJson(json);

      expect(object.boxIndex, 0);
      expect(object.label, 'IKEA BILLY bookcase');
      expect(object.boundingBox.x, 0.1);
      expect(object.estimatedValue?.low, 40.0);
    });

    test('toJson should create a valid JSON map', () {
      const object = DetectedObject(
        boxIndex: 1,
        label: 'test',
        category: 'test-cat',
        confidence: 0.8,
        boundingBox: BoundingBox(x: 0, y: 0, width: 1, height: 1),
      );

      final json = object.toJson();

      expect(json['boxIndex'], 1);
      expect(json['label'], 'test');
      expect((json['boundingBox'] as BoundingBox).x, 0);
    });
  });
}
