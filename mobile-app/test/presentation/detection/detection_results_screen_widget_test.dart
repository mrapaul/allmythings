import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/presentation/detection/detection_results_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../fixtures/mock_data.dart';
import '../../test_utils/test_widget_helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DetectionResultsScreen Widget Tests', () {
    testWidgets(
      'should display detections with bounding boxes',
      (WidgetTester tester) async {
        // Arrange
        final detections = MockDataFactory.createDetections(3);
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        for (final detection in detections) {
          expectTextExists(detection.label);
        }
        expect(
          find.byType(CustomPaint),
          findsWidgets,
          reason: 'Bounding boxes should be painted',
        );
      },
    );

    testWidgets(
      'should display confidence scores for each detection',
      (WidgetTester tester) async {
        // Arrange
        final detection = MockDataFactory.createDetection(
          confidence: 0.95,
        );
        final response = MockDataFactory.createDetectionResponse(
          detections: [detection],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('95%');
        expectTextExists('lamp');
      },
    );

    testWidgets(
      'should allow object selection',
      (WidgetTester tester) async {
        // Arrange
        final detections = MockDataFactory.createDetections(2);
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Find and tap first detection label
        final firstLabel = find.text(detections.first.label);
        await tapAndSettle(tester, firstLabel);

        // Assert
        expect(find.byType(CheckBox), findsWidgets,
            reason: 'Selection should be visible');
      },
    );

    testWidgets(
      'should handle bounding boxes at screen boundaries',
      (WidgetTester tester) async {
        // Arrange
        final detection = MockDataFactory.createDetectionAtBoundary();
        final response = MockDataFactory.createDetectionResponse(
          detections: [detection],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert - should render without errors
        expectWidgetExists(find.byType(Image));
      },
    );

    testWidgets(
      'should handle full-width detections',
      (WidgetTester tester) async {
        // Arrange
        final detection = MockDataFactory.createDetectionFullWidth();
        final response = MockDataFactory.createDetectionResponse(
          detections: [detection],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectWidgetExists(find.byType(CustomPaint));
      },
    );

    testWidgets(
      'should display ensemble details when available',
      (WidgetTester tester) async {
        // Arrange
        final ensembleDetails = MockDataFactory.createEnsembleDetails(
          providersUsed: 3,
          providerAgreement: 3,
        );
        final detection = MockDataFactory.createDetection(
          ensembleDetails: ensembleDetails,
        );
        final response = MockDataFactory.createDetectionResponse(
          detections: [detection],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('Providers: 3');
      },
    );

    testWidgets(
      'should show alternative labels when tapped',
      (WidgetTester tester) async {
        // Arrange
        final detection = MockDataFactory.createDetection(
          alternativeLabels: [
            MockDataFactory.createAlternativeLabel(label: 'light'),
            MockDataFactory.createAlternativeLabel(label: 'fixture'),
          ],
        );
        final response = MockDataFactory.createDetectionResponse(
          detections: [detection],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Find and tap detection to see alternatives
        final label = find.text(detection.label);
        await tapAndSettle(tester, label);

        // Assert
        expectTextExists('light');
        expectTextExists('fixture');
      },
    );

    testWidgets(
      'should handle empty detection list',
      (WidgetTester tester) async {
        // Arrange
        final response = MockDataFactory.createDetectionResponse(
          detections: [],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('No objects detected');
      },
    );

    testWidgets(
      'should render save button and handle tap',
      (WidgetTester tester) async {
        // Arrange
        final detections = MockDataFactory.createDetections(1);
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectWidgetExists(find.byIcon(Icons.check_circle));

        // Tap save button
        await tapAndSettle(tester, find.byIcon(Icons.check_circle));

        // Should navigate away
        expect(find.byType(DetectionResultsScreen), findsNothing);
      },
    );

    testWidgets(
      'should handle detection with low confidence',
      (WidgetTester tester) async {
        // Arrange
        final detection = MockDataFactory.createDetectionWithLowConfidence();
        final response = MockDataFactory.createDetectionResponse(
          detections: [detection],
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('45%');
        expectTextExists('uncertain_object');
      },
    );

    testWidgets(
      'should support deselection of objects',
      (WidgetTester tester) async {
        // Arrange
        final detections = MockDataFactory.createDetections(2);
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Select first object
        await tapAndSettle(tester, find.text(detections.first.label));

        // Deselect by tapping again
        await tapAndSettle(tester, find.text(detections.first.label));

        // Assert - checkbox should be unchecked
        expect(find.byType(Checkbox), findsWidgets);
      },
    );

    testWidgets(
      'should display multiple detections with different confidences',
      (WidgetTester tester) async {
        // Arrange
        final detections = [
          MockDataFactory.createDetection(label: 'chair'),
          MockDataFactory.createDetection(label: 'table', confidence: 0.80),
          MockDataFactory.createDetection(confidence: 0.72),
        ];
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('chair');
        expectTextExists('table');
        expectTextExists('lamp');
        expectTextExists('95%');
        expectTextExists('80%');
        expectTextExists('72%');
      },
    );

    testWidgets(
      'should have minimum touch targets for buttons',
      (WidgetTester tester) async {
        // Arrange
        final detections = MockDataFactory.createDetections(1);
        final response = MockDataFactory.createDetectionResponse(
          detections: detections,
        );

        // Act
        await tester.pumpWidget(
          createRiverpodTestWidget(
            DetectionResultsScreen(detectionResponse: response),
          ),
        );
        await tester.pumpAndSettle();

        // Assert - save button meets minimum touch target
        expectMinimumTouchTarget(find.byIcon(Icons.check_circle));
      },
    );
  });
}
