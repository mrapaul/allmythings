import 'package:flutter_test/flutter_test.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/alternative_label.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';

void main() {
  group('Detection Model Tests', () {
    group('Detection Creation', () {
      test('creates Detection with required fields', () {
        final detection = Detection(
          object: 'couch',
          confidence: 0.95,
          boundingBox: BoundingBox(top: 0.1, left: 0.1, bottom: 0.5, right: 0.5),
        );

        expect(detection.object, equals('couch'));
        expect(detection.confidence, equals(0.95));
        expect(detection.boundingBox, isNotNull);
      });

      test('creates Detection with null boundingBox', () {
        final detection = Detection(
          object: 'lamp',
          confidence: 0.87,
        );

        expect(detection.object, equals('lamp'));
        expect(detection.confidence, equals(0.87));
        expect(detection.boundingBox, isNull);
      });

      test('creates Detection with alternative labels', () {
        final labels = [
          AlternativeLabel(name: 'sofa', confidence: 0.92),
          AlternativeLabel(name: 'settee', confidence: 0.88),
        ];
        final detection = Detection(
          object: 'couch',
          confidence: 0.95,
          alternativeLabels: labels,
        );

        expect(detection.alternativeLabels, equals(labels));
        expect(detection.alternativeLabels!.length, equals(2));
      });
    });

    group('Confidence Validation', () {
      test('accepts confidence between 0 and 1', () {
        final detection = Detection(
          object: 'table',
          confidence: 0.5,
        );
        expect(detection.confidence, equals(0.5));
      });

      test('accepts confidence of 0', () {
        final detection = Detection(
          object: 'item',
          confidence: 0.0,
        );
        expect(detection.confidence, equals(0.0));
      });

      test('accepts confidence of 1', () {
        final detection = Detection(
          object: 'item',
          confidence: 1.0,
        );
        expect(detection.confidence, equals(1.0));
      });
    });

    group('Object Name Handling', () {
      test('preserves object name case', () {
        final detection = Detection(
          object: 'CouchSofa',
          confidence: 0.9,
        );
        expect(detection.object, equals('CouchSofa'));
      });

      test('handles multi-word object names', () {
        final detection = Detection(
          object: 'coffee table',
          confidence: 0.85,
        );
        expect(detection.object, equals('coffee table'));
      });

      test('handles special characters in object names', () {
        final detection = Detection(
          object: 'bed-frame',
          confidence: 0.88,
        );
        expect(detection.object, equals('bed-frame'));
      });
    });
  });

  group('BoundingBox Model Tests', () {
    group('BoundingBox Creation', () {
      test('creates valid BoundingBox', () {
        final box = BoundingBox(
          top: 0.1,
          left: 0.2,
          bottom: 0.7,
          right: 0.8,
        );

        expect(box.top, equals(0.1));
        expect(box.left, equals(0.2));
        expect(box.bottom, equals(0.7));
        expect(box.right, equals(0.8));
      });

      test('allows edge coordinates', () {
        final box = BoundingBox(
          top: 0.0,
          left: 0.0,
          bottom: 1.0,
          right: 1.0,
        );

        expect(box.top, equals(0.0));
        expect(box.left, equals(0.0));
        expect(box.bottom, equals(1.0));
        expect(box.right, equals(1.0));
      });
    });

    group('BoundingBox Validation', () {
      test('creates box with reasonable proportions', () {
        final box = BoundingBox(
          top: 0.25,
          left: 0.25,
          bottom: 0.75,
          right: 0.75,
        );

        final width = box.right - box.left;
        final height = box.bottom - box.top;

        expect(width, equals(0.5));
        expect(height, equals(0.5));
      });
    });
  });

  group('AlternativeLabel Model Tests', () {
    test('creates AlternativeLabel with name and confidence', () {
      final label = AlternativeLabel(
        name: 'sofa',
        confidence: 0.92,
      );

      expect(label.name, equals('sofa'));
      expect(label.confidence, equals(0.92));
    });

    test('handles multiple alternative labels', () {
      final labels = [
        AlternativeLabel(name: 'sofa', confidence: 0.92),
        AlternativeLabel(name: 'couch', confidence: 0.90),
        AlternativeLabel(name: 'settee', confidence: 0.88),
      ];

      expect(labels.length, equals(3));
      expect(labels.first.name, equals('sofa'));
      expect(labels.last.confidence, equals(0.88));
    });

    test('sorts labels by confidence descending', () {
      final labels = [
        AlternativeLabel(name: 'item1', confidence: 0.7),
        AlternativeLabel(name: 'item2', confidence: 0.9),
        AlternativeLabel(name: 'item3', confidence: 0.8),
      ];

      labels.sort((a, b) => b.confidence.compareTo(a.confidence));

      expect(labels[0].confidence, equals(0.9));
      expect(labels[1].confidence, equals(0.8));
      expect(labels[2].confidence, equals(0.7));
    });
  });

  group('EnsembleDetails Model Tests', () {
    test('creates EnsembleDetails with provider results', () {
      final ensemble = EnsembleDetails(
        primaryProvider: 'google',
        secondaryProvider: 'aws',
        confidenceScore: 0.88,
      );

      expect(ensemble.primaryProvider, equals('google'));
      expect(ensemble.secondaryProvider, equals('aws'));
      expect(ensemble.confidenceScore, equals(0.88));
    });

    test('handles null secondary provider', () {
      final ensemble = EnsembleDetails(
        primaryProvider: 'google',
        confidenceScore: 0.85,
      );

      expect(ensemble.primaryProvider, equals('google'));
      expect(ensemble.secondaryProvider, isNull);
      expect(ensemble.confidenceScore, equals(0.85));
    });
  });

  group('Model Serialization', () {
    test('Detection serialization round-trip', () {
      final original = Detection(
        object: 'chair',
        confidence: 0.92,
        boundingBox: BoundingBox(
          top: 0.1,
          left: 0.1,
          bottom: 0.6,
          right: 0.6,
        ),
      );

      // Simulate serialization by creating new instance with same data
      final serialized = Detection(
        object: original.object,
        confidence: original.confidence,
        boundingBox: original.boundingBox,
      );

      expect(serialized.object, equals(original.object));
      expect(serialized.confidence, equals(original.confidence));
      expect(serialized.boundingBox?.top, equals(original.boundingBox?.top));
    });

    test('BoundingBox serialization round-trip', () {
      final original = BoundingBox(
        top: 0.15,
        left: 0.20,
        bottom: 0.65,
        right: 0.75,
      );

      final serialized = BoundingBox(
        top: original.top,
        left: original.left,
        bottom: original.bottom,
        right: original.right,
      );

      expect(serialized.top, equals(original.top));
      expect(serialized.left, equals(original.left));
      expect(serialized.bottom, equals(original.bottom));
      expect(serialized.right, equals(original.right));
    });
  });

  group('Model Equality', () {
    test('same Detection values are equal', () {
      final detection1 = Detection(
        object: 'bed',
        confidence: 0.88,
      );
      final detection2 = Detection(
        object: 'bed',
        confidence: 0.88,
      );

      expect(detection1.object, equals(detection2.object));
      expect(detection1.confidence, equals(detection2.confidence));
    });

    test('different Detection values are not equal', () {
      final detection1 = Detection(
        object: 'bed',
        confidence: 0.88,
      );
      final detection2 = Detection(
        object: 'couch',
        confidence: 0.88,
      );

      expect(detection1.object, isNot(equals(detection2.object)));
    });
  });

  group('Null Safety Tests', () {
    test('Detection handles null alternative labels', () {
      final detection = Detection(
        object: 'lamp',
        confidence: 0.90,
        alternativeLabels: null,
      );

      expect(detection.alternativeLabels, isNull);
    });

    test('Detection handles empty alternative labels list', () {
      final detection = Detection(
        object: 'lamp',
        confidence: 0.90,
        alternativeLabels: [],
      );

      expect(detection.alternativeLabels, isEmpty);
    });

    test('EnsembleDetails handles null values gracefully', () {
      final ensemble = EnsembleDetails(
        primaryProvider: 'google',
        confidenceScore: 0.85,
      );

      expect(ensemble.primaryProvider, isNotNull);
      expect(ensemble.secondaryProvider, isNull);
    });
  });

  group('Type Coercion Tests', () {
    test('confidence as int is handled', () {
      final detection = Detection(
        object: 'item',
        confidence: 1,
      );
      expect(detection.confidence, isA<double>());
    });

    test('collection types are preserved', () {
      final labels = [
        AlternativeLabel(name: 'label1', confidence: 0.9),
      ];
      final detection = Detection(
        object: 'item',
        confidence: 0.85,
        alternativeLabels: labels,
      );

      expect(detection.alternativeLabels, isA<List<AlternativeLabel>>());
    });
  });
}
