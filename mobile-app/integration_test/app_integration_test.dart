import 'package:all_my_things/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App Integration Tests', () {
    testWidgets('app launches and shows inventory feed', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Check for profile button - always visible on home screen
      expect(find.byIcon(Icons.person), findsOneWidget);

      // Check for the add button (central camera/add button in bottom nav)
      expect(find.byIcon(Icons.add), findsOneWidget);

      // Verify we're on the inventory feed screen (app uses nested Scaffolds)
      expect(find.byType(Scaffold), findsWidgets);
    });

    testWidgets('can navigate to profile screen', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Tap on profile icon
      await tester.tap(find.byIcon(Icons.person));
      await tester.pumpAndSettle();

      // Verify profile screen is displayed
      expect(find.text('Profile'), findsOneWidget);
    });

    testWidgets('search bar accepts input', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Find and tap search field
      final searchField = find.byType(TextField).first;
      await tester.tap(searchField);
      await tester.pumpAndSettle();

      // Enter search text
      await tester.enterText(searchField, 'test query');
      await tester.pumpAndSettle();

      // Verify clear button appears when text is entered
      expect(find.byIcon(Icons.clear), findsOneWidget);
    });

    testWidgets('can clear search input', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Enter search text
      final searchField = find.byType(TextField).first;
      await tester.tap(searchField);
      await tester.enterText(searchField, 'test query');
      await tester.pumpAndSettle();

      // Tap clear button
      await tester.tap(find.byIcon(Icons.clear));
      await tester.pumpAndSettle();

      // Verify search is cleared (clear button should be gone)
      expect(find.byIcon(Icons.clear), findsNothing);
    });

    testWidgets('add button is visible on home screen', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Check for add button (central camera/add button in the navigation)
      expect(find.byIcon(Icons.add), findsOneWidget);
    });

    testWidgets('empty state shows when no items', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Check for empty state message (may or may not be present depending on data)
      final emptyText = find.text('Your inventory is empty');
      final hasEmptyState = tester.widgetList(emptyText).isNotEmpty;

      if (hasEmptyState) {
        // Empty state visible
        expect(emptyText, findsOneWidget);
        expect(find.text('Tap + to add your first item'), findsOneWidget);
      } else {
        // Has items - grid should be visible
        expect(find.byType(GridView), findsOneWidget);
      }
    });

    testWidgets('can pull to refresh on inventory feed', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Find the scrollable widget (RefreshIndicator wraps GridView)
      // Perform a scroll gesture to trigger refresh
      await tester.fling(
        find.byType(Scrollable).first,
        const Offset(0, 300),
        1000,
      );
      await tester.pumpAndSettle();
    });
  });
}
