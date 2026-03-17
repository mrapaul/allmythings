import 'package:all_my_things/main.dart' as app;
import 'package:all_my_things/application/providers/camera_providers.dart';
import 'package:all_my_things/application/providers/detection_providers.dart';
import 'mock_detection_repository.dart';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Background Detection and Review Flow', () {
    testWidgets('Capture and verify background processing with confirmation', (tester) async {
      // Set a larger surface size to ensure all buttons are visible
      tester.view.physicalSize = const Size(1200, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() => tester.view.resetPhysicalSize());

      // 1. Start the app
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            availableCamerasProvider.overrideWith((ref) => Future.value(<CameraDescription>[])),
            detectionRepositoryProvider.overrideWithValue(MockDetectionRepository()),
          ],
          child: const app.MyApp(),
        ),
      );
      
      // Wait for verification flow loader to finish and transition to feed
      debugPrint('Waiting for transition to feed...');
      await tester.pumpAndSettle(const Duration(seconds: 1));
      
      // If pumpAndSettle wasn't enough, try a short loop to wait for the feed
      bool feedVisible = false;
      for (int i = 0; i < 10; i++) {
        if (find.text('visual_vault').evaluate().isNotEmpty) {
          feedVisible = true;
          break;
        }
        debugPrint('Feed not visible yet, pumping... ($i)');
        await tester.pump(const Duration(milliseconds: 500));
      }
      
      // Verify we are on the feed
      expect(feedVisible, isTrue, reason: 'Inventory feed screen with visual_vault title never appeared');
      debugPrint('Successfully reached inventory feed');
      
      // 2. Wait for background identification to complete (Gemini can take time)
      bool successVisible = false;
      for (int i = 0; i < 120; i++) {
        // Use pump instead of pumpAndSettle because the loading spinner is an active animation
        await tester.pump(const Duration(seconds: 1));
        if (find.text('NEW').evaluate().isNotEmpty) {
          successVisible = true;
          break;
        }
      }
      
      expect(successVisible, isTrue, reason: 'NEW badge never appeared after background detection');

      // 3. Tap the item with NEW badge
      final newItem = find.text('NEW').first;
      await tester.tap(newItem);
      await tester.pumpAndSettle();

      // 4. Verify we land on detail screen with CONFIRM & SAVE button
      expect(find.text('CONFIRM & SAVE TO VAULT'), findsOneWidget);
      
      // 5. Confirm and save
      await tester.tap(find.text('CONFIRM & SAVE TO VAULT'));
      await tester.pumpAndSettle();
      
      // Wait for snackbar and return to feed logic (implied by confirmItem)
      // But we stay on the detail screen unless we explicitly pop
      // Looking at ItemDetailScreen.dart, we don't context.pop() after confirmItem
      
      expect(find.text('Item Details'), findsOneWidget);
      expect(find.text('CONFIRM & SAVE TO VAULT'), findsNothing);
    });
  });
}
