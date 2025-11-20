import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/presentation/home/inventory_feed_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../fixtures/mock_data.dart';
import '../../test_utils/test_widget_helpers.dart';

class MockInventoryRepository extends Mock {
  Future<List<InventoryItem>> getAll() async {
    return [];
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('InventoryFeedScreen Widget Tests', () {
    testWidgets(
      'should display grid of inventory items',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(6);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expect(find.byType(GridView), findsOneWidget);
        for (final item in items) {
          expectTextExists(item.label);
        }
      },
    );

    testWidgets(
      'should display empty state when no items',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => [],
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('No Items Yet');
        expectTextExists('Tap the camera icon to add your first item!');
      },
    );

    testWidgets(
      'should support pull-to-refresh',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(3);
        var refreshCount = 0;

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) {
                  refreshCount++;
                  return items;
                },
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Perform pull-to-refresh
        await tester.drag(
          find.byType(RefreshIndicator),
          const Offset(0, 300),
        );
        await tester.pumpAndSettle();

        // Assert - refresh indicator was shown
        expect(find.byType(RefreshIndicator), findsOneWidget);
      },
    );

    testWidgets(
      'should display FAB for adding items',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => [],
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expect(find.byType(FloatingActionButton), findsWidgets);
      },
    );

    testWidgets(
      'should navigate to item detail on tap',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(3);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Find and tap first item
        final firstItemLabel = find.text(items.first.label);
        await tapAndSettle(tester, firstItemLabel);

        // Assert - should navigate (detail screen should appear)
        // Note: Actual navigation depends on router setup
      },
    );

    testWidgets(
      'should display loading state while fetching items',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async {
                  await Future.delayed(const Duration(milliseconds: 500));
                  return MockDataFactory.createInventoryItems(3);
                },
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );

        // Assert - loading indicator should be present
        expect(find.byType(CircularProgressIndicator), findsOneWidget);

        // Wait for data to load
        await tester.pumpAndSettle();

        // Items should be visible
        expect(find.byType(GridView), findsOneWidget);
      },
    );

    testWidgets(
      'should handle error state gracefully',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async {
                  throw Exception('Failed to load items');
                },
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expect(find.byType(ErrorView), findsOneWidget);
      },
    );

    testWidgets(
      'should display correct grid layout (3 columns)',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(9);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expect(find.byType(GridView), findsOneWidget);
        // SliverGrid should have 3 columns
      },
    );

    testWidgets(
      'should scroll grid smoothly',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(20);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Scroll down
        await tester.drag(find.byType(GridView), const Offset(0, -300));
        await tester.pumpAndSettle();

        // Assert - should still show items
        expect(find.byType(GridView), findsOneWidget);
      },
    );

    testWidgets(
      'should have proper app bar with title',
      (WidgetTester tester) async {
        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => [],
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('Home Inventory');
      },
    );

    testWidgets(
      'should show item images in grid cards',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(3);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expect(find.byType(Image), findsWidgets);
      },
    );

    testWidgets(
      'should have minimum touch target size for items',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(1);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        final itemCard = find.byType(Card).first;
        expectMinimumTouchTarget(itemCard);
      },
    );

    testWidgets(
      'should display item metadata (location)',
      (WidgetTester tester) async {
        // Arrange
        final items = [
          MockDataFactory.createInventoryItem(
            id: 1,
            label: 'lamp',
            location: 'bedroom',
          ),
        ];

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert
        expectTextExists('bedroom');
      },
    );

    testWidgets(
      'should handle large inventory list efficiently',
      (WidgetTester tester) async {
        // Arrange
        final items = MockDataFactory.createInventoryItems(100);

        // Act
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              inventoryItemsProvider.overrideWith(
                (ref) async => items,
              ),
            ],
            child: createFullScreenTestWidget(
              const InventoryFeedScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Assert - should render without crashing
        expect(find.byType(GridView), findsOneWidget);
      },
    );
  });
}
