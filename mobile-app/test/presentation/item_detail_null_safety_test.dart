// Section-08 §10: ItemDetailScreen MUST render the
// vlmStructuredAttributes={} fall-through case without NPE-ing. We drive
// this with an in-memory Drift DB seeded with one inventory_item (id IS
// sceneId) and zero labels — that is the post-pipeline state when
// classification_refine cascades through every VLM tier.
//
// The strings asserted here changed when the presentation layer was
// re-skinned to the Disney+ design; the underlying invariant (renders
// without crashing for a `{}` detectionData) is what's still being
// guarded.
import 'package:all_my_things/application/providers/database_provider.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/screens/item_detail_screen.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders item with empty detectionData (no NPE on {} attributes)',
      (tester) async {
    final db = AppDatabase.inMemory();
    await db.into(db.inventoryItems).insert(
          InventoryItemsCompanion.insert(
            id: 'scene-empty',
            photoPath: '/tmp/p',
            thumbnailPath: '/tmp/t',
            detectionData: '{}',
            status: const Value('completed'),
            isFlagged: const Value(false),
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );
    addTearDown(db.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) async => db),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const ItemDetailScreen(itemId: 'scene-empty'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // The fallback "Untitled" label rendered (means the screen got past
    // detectionData parsing without throwing).
    expect(find.text('Untitled'), findsOneWidget,
        reason: 'item_detail must show the empty-state label, not crash');
    // Notes card still visible.
    expect(find.text('NOTES'), findsOneWidget);
  });

  testWidgets('renders flagged item without crashing', (tester) async {
    final db = AppDatabase.inMemory();
    await db.into(db.inventoryItems).insert(
          InventoryItemsCompanion.insert(
            id: 'scene-flagged',
            photoPath: '/tmp/p',
            thumbnailPath: '/tmp/t',
            detectionData: '{}',
            status: const Value('flagged'),
            isFlagged: const Value(true),
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ),
        );
    addTearDown(db.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWith((ref) async => db),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const ItemDetailScreen(itemId: 'scene-flagged'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Whatever the visual treatment, the fallback "Untitled" must still
    // render — the contract is "doesn't crash on {} attributes".
    expect(find.text('Untitled'), findsOneWidget);
  });
}
