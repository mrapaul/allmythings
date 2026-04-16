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

    test('fromApiItem should parse Florence pipeline response format', () {
      final item = {
        'id': '3',
        'label': 'IKEA KALLAX shelf',
        'confidence': 0.88,
        'bbox': {'x': 0.05, 'y': 0.1, 'width': 0.4, 'height': 0.6},
        'attributes': {
          'category': 'storage furniture',
          'color': 'white',
          'material': 'particleboard',
          'condition': 'good',
          'description': 'Cube shelf unit',
          'search_tags': ['shelf', 'storage', 'ikea'],
        },
      };

      final object = DetectedObject.fromApiItem(item);

      expect(object.boxIndex, 3);
      expect(object.label, 'IKEA KALLAX shelf');
      expect(object.confidence, 0.88);
      expect(object.category, 'storage furniture');
      expect(object.colors, ['white']);
      expect(object.materials, ['particleboard']);
      expect(object.condition, 'good');
      expect(object.description, 'Cube shelf unit');
      expect(object.searchTags, ['shelf', 'storage', 'ikea']);
      expect(object.boundingBox.x, 0.05);
      expect(object.boundingBox.width, 0.4);
    });

    test('fromApiItem handles missing optional fields gracefully', () {
      final item = {
        'id': '0',
        'label': 'Unknown object',
        'confidence': 0.5,
        'bbox': <String, dynamic>{},
        'attributes': <String, dynamic>{},
      };

      final object = DetectedObject.fromApiItem(item);

      expect(object.boxIndex, 0);
      expect(object.label, 'Unknown object');
      expect(object.category, '');
      expect(object.colors, isEmpty);
      expect(object.materials, isEmpty);
      expect(object.searchTags, isEmpty);
      expect(object.condition, isNull);
      expect(object.description, isNull);
      expect(object.boundingBox.x, 0.0);
    });
  });
}
