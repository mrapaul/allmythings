import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:home_inventory/application/providers/inventory_providers.dart';
import 'package:home_inventory/data/database/app_database.dart';
import 'package:home_inventory/domain/models/bounding_box.dart';
import 'package:home_inventory/domain/models/detection.dart';
import 'package:home_inventory/domain/models/ensemble_details.dart';
import 'package:home_inventory/presentation/common/custom_app_bar.dart';
import 'package:home_inventory/presentation/common/error_view.dart';
import 'package:home_inventory/presentation/common/loading_indicator.dart';
import 'package:home_inventory/presentation/home/inventory_feed_screen.dart';
import 'package:home_inventory/presentation/items/item_detail_screen.dart';
import 'package:mockito/mockito.dart';

// Mocks
class MockInventoryListNotifier
    extends AutoDisposeAsyncNotifier<List<InventoryItem>>
    with Mock
    implements InventoryListNotifier {}

class MockInventoryItem extends Mock implements InventoryItem {}

void main() {
  group('InventoryFeedScreen', () {
    late MockInventoryListNotifier mockNotifier;

    setUp(() {
      mockNotifier = MockInventoryListNotifier();
    });

    Future<void> pumpInventoryFeedScreen(
      WidgetTester tester,
      AsyncValue<List<InventoryItem>> state,
    ) async {
      when(
        mockNotifier.build(),
      ).thenAnswer((_) async => state.valueOrNull ?? []);
      when(
        mockNotifier.future,
      ).thenAnswer((_) => Future.value(state.valueOrNull ?? []));

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            inventoryItemsProvider.overrideWith(() => mockNotifier),
          ],
          child: const MaterialApp(
            home: InventoryFeedScreen(),
          ),
        ),
      );
    }

    testWidgets('displays loading indicator when loading', (tester) async {
      await pumpInventoryFeedScreen(tester, const AsyncValue.loading());
      expect(find.byType(ShimmerGrid), findsOneWidget);
    });

    testWidgets('displays error view when error occurs', (tester) async {
      await pumpInventoryFeedScreen(
        tester,
        AsyncValue.error(Exception('Test Error'), StackTrace.current),
      );
      expect(find.byType(ErrorView), findsOneWidget);
      expect(find.text('Failed to load inventory'), findsOneWidget);
    });

    testWidgets('displays empty state when no items', (tester) async {
      await pumpInventoryFeedScreen(tester, const AsyncValue.data([]));
      expect(find.text('No Items Yet'), findsOneWidget);
      expect(
        find.text('Tap the camera icon to add your first item!'),
        findsOneWidget,
      );
    });

    testWidgets('displays items in grid when data is available', (
      tester,
    ) async {
      final item1 = InventoryItem(
        id: 1,
        photoPath: 'path/to/photo1.jpg',
        thumbnailPath: 'path/to/thumb1.jpg',
        detectionData: jsonEncode(
          Detection(
            id: 'det1',
            label: 'Chair',
            confidence: 0.9,
            boundingBox: BoundingBox(x: 0, y: 0, width: 10, height: 10),
            ensembleDetails: EnsembleDetails(
              providersUsed: 2,
              providerAgreement: 2,
              labelConsensus: 'Chair',
            ),
            alternativeLabels: [],
          ).toJson(),
        ),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      final item2 = InventoryItem(
        id: 2,
        photoPath: 'path/to/photo2.jpg',
        thumbnailPath: 'path/to/thumb2.jpg',
        detectionData: jsonEncode(
          Detection(
            id: 'det2',
            label: 'Table',
            confidence: 0.8,
            boundingBox: BoundingBox(x: 0, y: 0, width: 10, height: 10),
            ensembleDetails: EnsembleDetails(
              providersUsed: 2,
              providerAgreement: 2,
              labelConsensus: 'Table',
            ),
            alternativeLabels: [],
          ).toJson(),
        ),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await pumpInventoryFeedScreen(tester, AsyncValue.data([item1, item2]));
      await tester.pumpAndSettle();

      expect(find.text('Chair'), findsOneWidget);
      expect(find.text('Table'), findsOneWidget);
      expect(find.byType(CustomScrollView), findsOneWidget);
    });

    testWidgets('tapping an item navigates to ItemDetailScreen', (
      tester,
    ) async {
      final item1 = InventoryItem(
        id: 1,
        photoPath: 'path/to/photo1.jpg',
        thumbnailPath: 'path/to/thumb1.jpg',
        detectionData: jsonEncode(
          Detection(
            id: 'det1',
            label: 'Chair',
            confidence: 0.9,
            boundingBox: BoundingBox(x: 0, y: 0, width: 10, height: 10),
            ensembleDetails: EnsembleDetails(
              providersUsed: 2,
              providerAgreement: 2,
              labelConsensus: 'Chair',
            ),
            alternativeLabels: [],
          ).toJson(),
        ),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await pumpInventoryFeedScreen(tester, AsyncValue.data([item1]));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Chair'));
      await tester.pumpAndSettle();

      expect(find.byType(ItemDetailScreen), findsOneWidget);
    });

    testWidgets('pull to refresh invalidates inventoryItemsProvider', (
      tester,
    ) async {
      await pumpInventoryFeedScreen(tester, const AsyncValue.data([]));
      await tester.pumpAndSettle();

      // Simulate a pull to refresh gesture
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 300));
      await tester.pumpAndSettle();

      verify(
        mockNotifier.build(),
      ).called(greaterThan(1)); // build is called initially and then on refresh
    });
  });
}
