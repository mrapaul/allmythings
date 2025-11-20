import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Helper to create a test widget with Riverpod ProviderScope
Widget createRiverpodTestWidget(
  Widget child, {
  List<Override> overrides = const [],
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      theme: ThemeData.light(),
      home: Scaffold(
        body: child,
      ),
    ),
  );
}

/// Helper to create a test widget with proper Material theme
Widget createMaterialTestWidget(Widget child) {
  return MaterialApp(
    theme: ThemeData(
      useMaterial3: true,
      primaryColor: AppTheme.primaryColor,
      scaffoldBackgroundColor: AppTheme.backgroundColor,
    ),
    home: Scaffold(
      body: child,
    ),
  );
}

/// Helper to create a full screen test widget
Widget createFullScreenTestWidget(Widget child) {
  return MaterialApp(
    theme: ThemeData(useMaterial3: true),
    home: child,
  );
}

/// Helper to pump widget and settle all animations
Future<void> pumpAndSettle(WidgetTester tester) async {
  await tester.pumpAndSettle();
}

/// Helper to pump widget with a specific duration
Future<void> pumpAfterDelay(WidgetTester tester, Duration duration) async {
  await tester.pumpAndSettle(duration);
}

/// Helper to tap and wait for animations
Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// Helper to long press and wait for animations
Future<void> longPressAndSettle(WidgetTester tester, Finder finder) async {
  await tester.longPress(finder);
  await tester.pumpAndSettle();
}

/// Helper to enter text
Future<void> enterText(WidgetTester tester, Finder finder, String text) async {
  await tester.enterText(finder, text);
  await tester.pumpAndSettle();
}

/// Helper to clear text
Future<void> clearText(WidgetTester tester, Finder finder) async {
  await tester.enterText(finder, '');
  await tester.pumpAndSettle();
}

/// Helper to scroll to widget
Future<void> scrollToWidget(
  WidgetTester tester,
  Finder finder, {
  double delta = -300,
}) async {
  await tester.drag(find.byType(SingleChildScrollView).first, Offset(0, delta));
  await tester.pumpAndSettle();
}

/// Helper to verify widget exists
void expectWidgetExists(Finder finder) {
  expect(finder, findsOneWidget);
}

/// Helper to verify widget doesn't exist
void expectWidgetNotExists(Finder finder) {
  expect(finder, findsNothing);
}

/// Helper to verify text exists
void expectTextExists(String text) {
  expect(find.text(text), findsOneWidget);
}

/// Helper to verify text doesn't exist
void expectTextNotExists(String text) {
  expect(find.text(text), findsNothing);
}

/// Helper to verify icon exists
void expectIconExists(IconData icon) {
  expect(find.byIcon(icon), findsOneWidget);
}

/// Helper to get widget by type
T getWidget<T extends Widget>(Finder finder) {
  return (finder.evaluate().single.widget) as T;
}

/// Helper to verify semantic label exists
void expectSemanticLabel(String label) {
  expect(find.bySemanticsLabel(label), findsOneWidget);
}

/// Helper to verify touch target size (minimum 48x48dp)
void expectMinimumTouchTarget(Finder finder) {
  final size = _getWidgetSize(finder);
  expect(size.width, greaterThanOrEqualTo(48.0),
      reason: 'Touch target width must be at least 48dp');
  expect(size.height, greaterThanOrEqualTo(48.0),
      reason: 'Touch target height must be at least 48dp');
}

/// Helper to get widget size
Size _getWidgetSize(Finder finder) {
  expect(finder, findsOneWidget);
  final RenderBox renderBox = finder.evaluate().single.renderObject as RenderBox;
  return renderBox.size;
}

/// Helper to verify widget is visible
void expectWidgetVisible(Finder finder) {
  expect(find.byWidgetPredicate((widget) {
    return widget == finder.evaluate().first.widget;
  }), findsWidgets);
}

/// Helper for accessibility testing - verify semantics enabled
void expectAccessibilityEnabled(WidgetTester tester) {
  expect(tester.binding.window.semanticsEnabled, true);
}

/// Helper to get widget offset
Offset getWidgetOffset(Finder finder) {
  expect(finder, findsOneWidget);
  final RenderBox renderBox = finder.evaluate().single.renderObject as RenderBox;
  return renderBox.localToGlobal(Offset.zero);
}

/// Helper to verify widget is centered
void expectWidgetCentered(Finder finder, Size screenSize) {
  final offset = getWidgetOffset(finder);
  final size = _getWidgetSize(finder);

  final expectedCenterX = screenSize.width / 2;
  final widgetCenterX = offset.dx + (size.width / 2);

  expect(widgetCenterX, closeTo(expectedCenterX, 10));
}
