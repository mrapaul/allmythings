import 'package:all_my_things/domain/models/item.dart';
import 'package:all_my_things/presentation/widgets/item_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('ItemCard displays item data and handles tap',
      (WidgetTester tester) async {
    final item = Item(
      id: '1',
      name: 'Test Item',
      description: 'This is a test item.',
      imagePath: 'assets/images/test_image.png', // Assuming a test image asset
      labels: const ['test', 'widget'],
    );

    bool tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ItemCard(
            item: item,
            onTap: () {
              tapped = true;
            },
          ),
        ),
      ),
    );

    // Verify that the item's name and labels are displayed.
    expect(find.text('Test Item'), findsOneWidget);
    expect(find.text('test'), findsOneWidget);
    expect(find.text('widget'), findsOneWidget);

    // Simulate a tap on the card.
    await tester.tap(find.byType(ItemCard));
    await tester.pump();

    // Verify that the onTap callback was called.
    expect(tapped, isTrue);
  });
}
