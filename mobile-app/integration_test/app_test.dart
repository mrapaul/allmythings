import 'package:all_my_things/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

void main() {
  patrolTest(
    'app launches and shows inventory feed',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());

      // Verify app title is present
      expect($('All My Things'), findsWidgets);

      // Verify inventory feed screen is displayed
      // Should show either empty state or items grid
      await $.pump(const Duration(seconds: 2));

      // Check for search bar - always present on home screen
      expect($(Icons.search), findsOneWidget);

      // Check for profile button
      expect($(Icons.person), findsOneWidget);
    },
  );

  patrolTest(
    'can navigate to profile screen',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());
      await $.pump(const Duration(seconds: 1));

      // Tap on profile icon
      await $(Icons.person).tap();
      await $.pumpAndSettle();

      // Verify profile screen is displayed
      expect($('Profile'), findsOneWidget);
    },
  );

  patrolTest(
    'search bar accepts input',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());
      await $.pump(const Duration(seconds: 1));

      // Find and tap search field
      final searchField = $(TextField).first;
      await searchField.tap();
      await $.pumpAndSettle();

      // Enter search text
      await searchField.enterText('test query');
      await $.pumpAndSettle();

      // Verify clear button appears when text is entered
      expect($(Icons.clear), findsOneWidget);
    },
  );

  patrolTest(
    'can clear search input',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());
      await $.pump(const Duration(seconds: 1));

      // Enter search text
      final searchField = $(TextField).first;
      await searchField.tap();
      await searchField.enterText('test query');
      await $.pumpAndSettle();

      // Tap clear button
      await $(Icons.clear).tap();
      await $.pumpAndSettle();

      // Verify search is cleared (clear button should be gone)
      expect($(Icons.clear), findsNothing);
    },
  );

  patrolTest(
    'FAB is visible on home screen',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());
      await $.pump(const Duration(seconds: 1));

      // Check for FAB (FloatingActionButton with add icon)
      expect($(FloatingActionButton), findsWidgets);
    },
  );

  patrolTest(
    'empty state shows when no items',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());
      await $.pump(const Duration(seconds: 2));

      // Check for empty state message (may or may not be present depending on data)
      // If empty, should show the empty state card
      final emptyText = $('Your inventory is empty');
      final hasItems = emptyText.evaluate().isEmpty;

      if (!hasItems) {
        // Empty state visible
        expect(emptyText, findsOneWidget);
        expect($('Tap + to add your first item'), findsOneWidget);
      } else {
        // Has items - grid should be visible
        expect($(GridView), findsOneWidget);
      }
    },
  );

  patrolTest(
    'can pull to refresh on inventory feed',
    ($) async {
      await $.pumpWidgetAndSettle(const MyApp());
      await $.pump(const Duration(seconds: 2));

      // Find the scrollable widget (RefreshIndicator wraps GridView)
      // Perform a scroll gesture to trigger refresh
      await $.tester.fling(
        find.byType(Scrollable).first,
        const Offset(0, 300),
        1000,
      );
      await $.pumpAndSettle();
    },
  );
}
