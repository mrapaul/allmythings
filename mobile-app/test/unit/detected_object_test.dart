import 'dart:convert';

import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:flutter_test/flutter_test.dart';

import '../fixtures/mock_data.dart';

/// Performs a true round-trip via JSON encoding/decoding so that nested
/// Freezed objects (BoundingBox, ValueRange) are fully serialized.
DetectedObject roundTrip(DetectedObject obj) {
  final jsonStr = jsonEncode(obj.toJson());
  return DetectedObject.fromJson(
    jsonDecode(jsonStr) as Map<String, dynamic>,
  );
}

void main() {
  group('BoundingBox', () {
    test('fromJson correctly deserializes all fields', () {
      final json = {
        'x': 0.1,
        'y': 0.05,
        'width': 0.25,
        'height': 0.85,
      };

      final box = BoundingBox.fromJson(json);

      expect(box.x, 0.1);
      expect(box.y, 0.05);
      expect(box.width, 0.25);
      expect(box.height, 0.85);
    });

    test('toJson serializes all fields correctly', () {
      final box = BoundingBox(x: 0.1, y: 0.05, width: 0.25, height: 0.85);
      final json = box.toJson();

      expect(json['x'], 0.1);
      expect(json['y'], 0.05);
      expect(json['width'], 0.25);
      expect(json['height'], 0.85);
    });

    test('fromJson handles integer values as doubles', () {
      final json = {'x': 0, 'y': 0, 'width': 1, 'height': 1};
      final box = BoundingBox.fromJson(json);

      expect(box.x, 0.0);
      expect(box.y, 0.0);
      expect(box.width, 1.0);
      expect(box.height, 1.0);
    });

    test('round-trip serialization preserves values', () {
      final original = BoundingBox(x: 0.4, y: 0.1, width: 0.5, height: 0.35);
      final json = jsonDecode(jsonEncode(original.toJson())) as Map<String, dynamic>;
      final restored = BoundingBox.fromJson(json);

      expect(restored, original);
    });
  });

  group('ValueRange', () {
    test('fromJson correctly deserializes low and high', () {
      final json = {'low': 40.0, 'high': 70.0};
      final range = ValueRange.fromJson(json);

      expect(range.low, 40.0);
      expect(range.high, 70.0);
    });

    test('toJson serializes correctly', () {
      final range = ValueRange(low: 600.0, high: 900.0);
      final json = range.toJson();

      expect(json['low'], 600.0);
      expect(json['high'], 900.0);
    });

    test('fromJson handles integer values as doubles', () {
      final json = {'low': 40, 'high': 70};
      final range = ValueRange.fromJson(json);

      expect(range.low, 40.0);
      expect(range.high, 70.0);
    });

    test('round-trip serialization preserves values', () {
      final original = ValueRange(low: 40.0, high: 70.0);
      final restored = ValueRange.fromJson(original.toJson());

      expect(restored, original);
    });
  });

  group('DetectedObject', () {
    test('fromJson correctly deserializes full API response format', () {
      final json = {
        'boxIndex': 0,
        'label': 'IKEA BILLY bookcase',
        'category': 'living room furniture',
        'confidence': 0.92,
        'boundingBox': {'x': 0.1, 'y': 0.05, 'width': 0.25, 'height': 0.85},
        'brand': 'IKEA',
        'model': 'BILLY',
        'colors': ['birch', 'white'],
        'materials': ['particleboard', 'veneer'],
        'condition': 'good',
        'estimatedValue': {'low': 40.0, 'high': 70.0},
        'description': 'Standard IKEA bookcase with 5 adjustable shelves',
      };

      final obj = DetectedObject.fromJson(json);

      expect(obj.boxIndex, 0);
      expect(obj.label, 'IKEA BILLY bookcase');
      expect(obj.category, 'living room furniture');
      expect(obj.confidence, 0.92);
      expect(obj.boundingBox.x, 0.1);
      expect(obj.boundingBox.y, 0.05);
      expect(obj.boundingBox.width, 0.25);
      expect(obj.boundingBox.height, 0.85);
      expect(obj.brand, 'IKEA');
      expect(obj.model, 'BILLY');
      expect(obj.colors, ['birch', 'white']);
      expect(obj.materials, ['particleboard', 'veneer']);
      expect(obj.condition, 'good');
      expect(obj.estimatedValue?.low, 40.0);
      expect(obj.estimatedValue?.high, 70.0);
      expect(obj.description, 'Standard IKEA bookcase with 5 adjustable shelves');
    });

    test('fromJson correctly deserializes electronics response', () {
      final json = {
        'boxIndex': 1,
        'label': 'Samsung 55" QLED TV',
        'category': 'electronics',
        'confidence': 0.88,
        'boundingBox': {'x': 0.4, 'y': 0.1, 'width': 0.5, 'height': 0.35},
        'brand': 'Samsung',
        'model': 'QN55Q80C',
        'colors': ['black'],
        'materials': ['plastic', 'glass'],
        'condition': 'excellent',
        'estimatedValue': {'low': 600.0, 'high': 900.0},
        'description': '55 inch QLED smart TV mounted on wall',
      };

      final obj = DetectedObject.fromJson(json);

      expect(obj.boxIndex, 1);
      expect(obj.label, 'Samsung 55" QLED TV');
      expect(obj.brand, 'Samsung');
      expect(obj.model, 'QN55Q80C');
      expect(obj.colors, ['black']);
      expect(obj.materials, ['plastic', 'glass']);
      expect(obj.condition, 'excellent');
      expect(obj.estimatedValue?.low, 600.0);
      expect(obj.estimatedValue?.high, 900.0);
    });

    test('fromJson handles missing optional fields with defaults', () {
      final json = {
        'boxIndex': 2,
        'label': 'Wooden dining table',
        'category': 'dining room furniture',
        'confidence': 0.75,
        'boundingBox': {'x': 0.2, 'y': 0.3, 'width': 0.6, 'height': 0.4},
      };

      final obj = DetectedObject.fromJson(json);

      expect(obj.brand, isNull);
      expect(obj.model, isNull);
      expect(obj.colors, isEmpty);
      expect(obj.materials, isEmpty);
      expect(obj.condition, isNull);
      expect(obj.estimatedValue, isNull);
      expect(obj.description, isNull);
    });

    test('fromJson handles null optional fields explicitly set to null', () {
      final json = {
        'boxIndex': 0,
        'label': 'Leather sofa',
        'category': 'living room furniture',
        'confidence': 0.81,
        'boundingBox': {'x': 0.0, 'y': 0.5, 'width': 0.8, 'height': 0.4},
        'brand': null,
        'model': null,
        'colors': ['brown', 'tan'],
        'materials': ['leather', 'wood'],
        'condition': null,
        'estimatedValue': null,
        'description': null,
      };

      final obj = DetectedObject.fromJson(json);

      expect(obj.brand, isNull);
      expect(obj.model, isNull);
      expect(obj.condition, isNull);
      expect(obj.estimatedValue, isNull);
      expect(obj.description, isNull);
      expect(obj.colors, ['brown', 'tan']);
      expect(obj.materials, ['leather', 'wood']);
    });

    test('toJson serializes all fields using camelCase keys', () {
      final obj = sampleDetectedObject;
      final json = obj.toJson();

      expect(json.containsKey('boxIndex'), isTrue);
      expect(json.containsKey('label'), isTrue);
      expect(json.containsKey('category'), isTrue);
      expect(json.containsKey('confidence'), isTrue);
      expect(json.containsKey('boundingBox'), isTrue);
      expect(json.containsKey('brand'), isTrue);
      expect(json.containsKey('model'), isTrue);
      expect(json.containsKey('colors'), isTrue);
      expect(json.containsKey('materials'), isTrue);
      expect(json.containsKey('condition'), isTrue);
      expect(json.containsKey('estimatedValue'), isTrue);
      expect(json.containsKey('description'), isTrue);
    });

    test('round-trip serialization preserves all field values', () {
      final original = sampleDetectedObject;
      final restored = roundTrip(original);

      expect(restored, original);
    });

    test('round-trip serialization preserves electronics detection', () {
      final original = sampleDetectedObject2;
      final restored = roundTrip(original);

      expect(restored, original);
    });

    test('round-trip serialization preserves minimal object with no optionals', () {
      final original = sampleDetectedObjectMinimal;
      final restored = roundTrip(original);

      expect(restored, original);
    });

    test('confidence is correctly stored as double', () {
      final json = {
        'boxIndex': 0,
        'label': 'Office desk chair',
        'category': 'office furniture',
        'confidence': 0.95,
        'boundingBox': {'x': 0.0, 'y': 0.0, 'width': 0.5, 'height': 0.5},
      };

      final obj = DetectedObject.fromJson(json);
      expect(obj.confidence, isA<double>());
      expect(obj.confidence, closeTo(0.95, 0.0001));
    });

    test('colors list is correctly deserialized as List<String>', () {
      final json = {
        'boxIndex': 0,
        'label': 'Vintage wooden dresser',
        'category': 'bedroom furniture',
        'confidence': 0.83,
        'boundingBox': {'x': 0.1, 'y': 0.1, 'width': 0.4, 'height': 0.7},
        'colors': ['walnut', 'dark brown', 'mahogany'],
        'materials': ['solid wood', 'brass hardware'],
      };

      final obj = DetectedObject.fromJson(json);
      expect(obj.colors, hasLength(3));
      expect(obj.colors, containsAll(['walnut', 'dark brown', 'mahogany']));
      expect(obj.materials, hasLength(2));
    });
  });
}
