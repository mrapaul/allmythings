// Visual smoke test for the home feed.
//
// The legacy version of this test pinned the (deleted) DetectionResults
// screen's strings; the new presentation layer routes detection through
// SceneReviewScreen, so this is now a render-doesn't-crash smoke test on
// the home shell — proving the masonry feed boots, rendering chrome
// without the underlying detection providers being initialised.
import 'package:all_my_things/application/providers/database_provider.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/screens/inventory_feed_screen.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('InventoryFeedScreen renders empty state on a fresh DB',
      (tester) async {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) async => db),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const InventoryFeedScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The "blank canvas" empty-state hero should render.
    expect(find.text('A blank canvas'), findsOneWidget);
    // Action capsule renders — the library-side tooltip is reliably wrapped.
    expect(find.byTooltip('Pick from library'), findsOneWidget);
  });
}
