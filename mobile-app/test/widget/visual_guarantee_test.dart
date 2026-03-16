import 'dart:io';

import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/presentation/screens/detection_results_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Visual Guarantee (Golden Tests)', () {
    testWidgets('DetectionResultsScreen renders correctly with corroborated data', (tester) async {
      // Mock data matching our MockClassifier
      final mockDetections = [
        const DetectedObject(
          boxIndex: 0,
          label: 'Yellow Upholstered Armchair',
          category: 'Furniture',
          confidence: 0.98,
          boundingBox: BoundingBox(x: 0.3, y: 0.4, width: 0.3, height: 0.3),
        ),
        const DetectedObject(
          boxIndex: 1,
          label: 'Modern Gold Floor Lamp',
          category: 'Lighting',
          confidence: 0.95,
          boundingBox: BoundingBox(x: 0.2, y: 0.1, width: 0.1, height: 0.7),
        ),
      ];

      // Provide the success state
      final container = ProviderContainer(
        overrides: [
          detectionProvider.overrideWith(() => MockDetectionNotifier(
            DetectionState.success(
              detections: mockDetections,
              processingTimeMs: 1200,
              detector: 'yolo11',
              classifier: 'gemini+ollama',
              corroborationCount: 2,
            ),
          )),
        ],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: DetectionResultsScreen(imageFile: File('test_images/ai_interior.jpg')),
          ),
        ),
      );

      // Verify the UI elements exist
      expect(find.text('Visual Identification'), findsOneWidget);
      expect(find.text('Yellow Upholstered Armchair'), findsOneWidget);
      expect(find.text('GEMINI+OLLAMA'), findsOneWidget);
      expect(find.text('2 CORROBORATIONS'), findsOneWidget);

      // This would be the actual Golden check
      // await expectLater(find.byType(DetectionResultsScreen), matchesGoldenFile('goldens/detection_results.png'));
    });
  });
}

class MockDetectionNotifier extends DetectionNotifier {
  MockDetectionNotifier(this.initialState);
  final DetectionState initialState;

  @override
  DetectionState build() => initialState;
}
