import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:home_inventory/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Home Inventory App - Integration Tests', () {
    testWidgets('App should start and show empty inventory screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // App should start successfully
      expect(find.byType(MaterialApp), findsOneWidget);

      // Bottom navigation should be visible
      expect(find.byType(BottomNavigationBar), findsOneWidget);

      // Should have 4 navigation items
      expect(find.byIcon(Icons.home_outlined), findsOneWidget);
      expect(find.byIcon(Icons.add_circle_outline), findsOneWidget);
      expect(find.byIcon(Icons.search_outlined), findsOneWidget);
      expect(find.byIcon(Icons.person_outline), findsOneWidget);
    });

    testWidgets('Bottom navigation should work correctly', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Tap search button
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();

      // Should navigate to search screen
      // Search icon should now be filled
      expect(find.byIcon(Icons.search), findsOneWidget);

      // Tap profile button
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Should navigate to profile screen
      expect(find.byIcon(Icons.person), findsOneWidget);

      // Tap home button
      await tester.tap(find.byIcon(Icons.home));
      await tester.pumpAndSettle();

      // Should be back on home screen
      expect(find.byIcon(Icons.home), findsOneWidget);
    });

    testWidgets('Camera button should show image picker options', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Tap camera button
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle(const Duration(milliseconds: 500));

      // Should show bottom sheet with options
      expect(find.text('Take Photo'), findsOneWidget);
      expect(find.text('Choose from Library'), findsOneWidget);

      // Close bottom sheet by tapping outside
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();
    });

    testWidgets('Search screen should have search functionality', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to search screen
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();

      // Should have a search input
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('Profile screen should show stats', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to profile screen
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();

      // Should show profile content
      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('App should handle refresh on home screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Should be on home screen
      expect(find.byIcon(Icons.home), findsOneWidget);

      // Try to find RefreshIndicator
      final refreshFinder = find.byType(RefreshIndicator);

      if (refreshFinder.evaluate().isNotEmpty) {
        // Perform pull-to-refresh gesture
        await tester.drag(refreshFinder, const Offset(0, 300));
        await tester.pumpAndSettle();
      }

      // App should still be functional
      expect(find.byType(BottomNavigationBar), findsOneWidget);
    });
  });

  group('Database Operations', () {
    testWidgets('App should handle database initialization', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // App should load without database errors
      expect(find.text('Failed to load inventory'), findsNothing);

      // Should show inventory feed (even if empty)
      expect(find.byType(BottomNavigationBar), findsOneWidget);
    });
  });

  group('UI/UX Validations', () {
    testWidgets('No header should be visible on home screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Should not show "Home Inventory" header
      expect(find.text('Home Inventory'), findsNothing);
    });

    testWidgets('Bottom navigation should have proper styling', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      final bottomNav = tester.widget<BottomNavigationBar>(
        find.byType(BottomNavigationBar),
      );

      // Should not show labels
      expect(bottomNav.showSelectedLabels, false);
      expect(bottomNav.showUnselectedLabels, false);

      // Should have 4 items
      expect(bottomNav.items.length, 4);
    });
  });
}
