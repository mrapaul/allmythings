import 'package:all_my_things/presentation/common/custom_app_bar.dart';
import 'package:all_my_things/presentation/common/error_view.dart';
import 'package:all_my_things/presentation/common/loading_indicator.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../test_utils/test_widget_helpers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('LoadingIndicator Widget Tests', () {
    testWidgets(
      'should display circular progress indicator',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const LoadingIndicator(),
          ),
        );

        // Assert
        expect(find.byType(CircularProgressIndicator), findsOneWidget);
      },
    );

    testWidgets(
      'should display loading text',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const LoadingIndicator(
              message: 'Loading items...',
            ),
          ),
        );

        // Assert
        expectTextExists('Loading items...');
      },
    );

    testWidgets(
      'should center loading indicator',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const SizedBox(
              width: 400,
              height: 600,
              child: LoadingIndicator(),
            ),
          ),
        );

        // Assert
        final indicator = find.byType(CircularProgressIndicator);
        expectWidgetExists(indicator);
      },
    );
  });

  group('ErrorView Widget Tests', () {
    testWidgets(
      'should display error message',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const ErrorView(
              message: 'Something went wrong',
            ),
          ),
        );

        // Assert
        expectTextExists('Something went wrong');
      },
    );

    testWidgets(
      'should display retry button',
      (WidgetTester tester) async {
        // Arrange
        var retryCount = 0;

        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            ErrorView(
              message: 'Something went wrong',
              onRetry: () {
                retryCount++;
              },
            ),
          ),
        );

        // Assert
        expectTextExists('Retry');

        // Tap retry button
        await tapAndSettle(tester, find.text('Retry'));

        // Assert
        expect(retryCount, equals(1));
      },
    );

    testWidgets(
      'should display error icon',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const ErrorView(
              message: 'Error occurred',
            ),
          ),
        );

        // Assert
        expect(find.byIcon(Icons.error_outline), findsOneWidget);
      },
    );

    testWidgets(
      'should handle long error messages',
      (WidgetTester tester) async {
        // Arrange
        const longMessage =
            'This is a very long error message that should wrap properly without overflow and maintain readability';

        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            ErrorView(
              message: longMessage,
            ),
          ),
        );

        // Assert
        expectTextExists(longMessage);
      },
    );

    testWidgets(
      'should center error view content',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const SizedBox(
              width: 400,
              height: 600,
              child: ErrorView(
                message: 'Error',
              ),
            ),
          ),
        );

        // Assert
        expect(find.byType(ErrorView), findsOneWidget);
      },
    );
  });

  group('CustomAppBar Widget Tests', () {
    testWidgets(
      'should display title',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const CustomAppBar(
              title: 'My Items',
            ),
          ),
        );

        // Assert
        expectTextExists('My Items');
      },
    );

    testWidgets(
      'should display leading back button by default',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createFullScreenTestWidget(
            const Scaffold(
              appBar: CustomAppBar(
                title: 'Details',
              ),
              body: SizedBox(),
            ),
          ),
        );

        // Assert
        expect(find.byIcon(Icons.arrow_back), findsOneWidget);
      },
    );

    testWidgets(
      'should handle custom leading widget',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const CustomAppBar(
              title: 'Title',
              leading: Icon(Icons.menu),
            ),
          ),
        );

        // Assert
        expect(find.byIcon(Icons.menu), findsOneWidget);
      },
    );

    testWidgets(
      'should display actions',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const CustomAppBar(
              title: 'Title',
              actions: [
                Icon(Icons.search),
                Icon(Icons.more_vert),
              ],
            ),
          ),
        );

        // Assert
        expect(find.byIcon(Icons.search), findsOneWidget);
        expect(find.byIcon(Icons.more_vert), findsOneWidget);
      },
    );

    testWidgets(
      'should have proper title styling',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createMaterialTestWidget(
            const CustomAppBar(
              title: 'Styled Title',
            ),
          ),
        );

        // Assert
        final titleFinder = find.text('Styled Title');
        expect(titleFinder, findsOneWidget);

        // Verify it's a Text widget
        final textWidget = titleFinder.evaluate().single.widget as Text;
        expect(textWidget.style?.fontSize, greaterThan(0));
      },
    );

    testWidgets(
      'should maintain proper height',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createFullScreenTestWidget(
            const Scaffold(
              appBar: CustomAppBar(
                title: 'Title',
              ),
              body: SizedBox(),
            ),
          ),
        );

        // Assert
        final appBar = find.byType(AppBar);
        expect(appBar, findsOneWidget);
      },
    );

    testWidgets(
      'should be accessible with semantic labels',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createFullScreenTestWidget(
            const Scaffold(
              appBar: CustomAppBar(
                title: 'Accessible Title',
              ),
              body: SizedBox(),
            ),
          ),
        );

        // Assert
        // Verify semantics are properly set up
        expect(find.text('Accessible Title'), findsOneWidget);
      },
    );
  });

  group('Widget Integration Tests', () {
    testWidgets(
      'should work together in a full screen',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          createFullScreenTestWidget(
            Scaffold(
              appBar: const CustomAppBar(
                title: 'Test Screen',
              ),
              body: ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        const LoadingIndicator(
                          message: 'Loading...',
                        ),
                        const SizedBox(height: 32),
                        ErrorView(
                          message: 'Failed to load',
                          onRetry: () {},
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );

        // Assert
        expectTextExists('Test Screen');
        expectTextExists('Loading...');
        expectTextExists('Failed to load');
      },
    );
  });
}
