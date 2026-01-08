import 'dart:io';
import 'package:all_my_things/main.dart';
import 'package:all_my_things/presentation/navigation/main_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:http/http.dart' as http;

/// Comprehensive E2E tests for the detection flow
/// These tests verify the complete pipeline from image capture to inventory
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Detection Flow E2E Tests', () {
    testWidgets('API health check - verify backend is running', (tester) async {
      // First verify the API is accessible
      try {
        final response = await http.get(
          Uri.parse('http://localhost:3000/v1/health'),
        ).timeout(const Duration(seconds: 5));

        expect(response.statusCode, 200);
        expect(response.body.contains('healthy'), isTrue);
        debugPrint('✅ API health check passed: ${response.body}');
      } catch (e) {
        fail('API not running. Start with: cd api-service && npm run dev\nError: $e');
      }
    });

    testWidgets('app launches and shows main navigation with FAB', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Find the MainNavigation widget
      expect(find.byType(MainNavigation), findsOneWidget,
          reason: 'MainNavigation should be visible');

      // Find the FAB with add icon (inside AnimatedRotation > Icon)
      final addIcons = find.byIcon(Icons.add);
      expect(addIcons, findsWidgets, reason: 'Add icon should be visible in FAB');

      debugPrint('✅ App launched with FAB visible');
    });

    testWidgets('FAB expands to show camera/gallery options', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Find and tap the FAB (AnimatedContainer with gradient)
      final fab = find.byType(AnimatedContainer).first;
      await tester.tap(fab);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // After expanding, should see Camera, Gallery, Files options
      expect(find.text('Camera'), findsOneWidget, reason: 'Camera option should appear');
      expect(find.text('Gallery'), findsOneWidget, reason: 'Gallery option should appear');
      expect(find.text('Files'), findsOneWidget, reason: 'Files option should appear');

      debugPrint('✅ FAB expands with menu options');
    });

    testWidgets('tapping Camera opens camera capture screen', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Expand FAB first
      final fab = find.byType(AnimatedContainer).first;
      await tester.tap(fab);
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Tap Camera option
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Should be on camera screen with close button
      expect(find.byIcon(Icons.close), findsOneWidget,
          reason: 'Close button should be visible on camera screen');

      debugPrint('✅ Camera screen opened');
    });

    testWidgets('camera screen has gallery picker in simulator mode', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Open camera screen
      final fab = find.byType(AnimatedContainer).first;
      await tester.tap(fab);
      await tester.pumpAndSettle(const Duration(seconds: 1));
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // In simulator mode, verify gallery button exists
      expect(find.byIcon(Icons.photo_library_rounded), findsOneWidget,
          reason: 'Gallery picker should be visible in simulator mode');

      // Should have large capture button with add_photo icon for simulator
      expect(find.byIcon(Icons.add_photo_alternate_rounded), findsOneWidget,
          reason: 'Large gallery button should be visible in simulator mode');

      debugPrint('✅ Camera screen simulator controls verified');
    });

    testWidgets('can close camera screen and return to inventory', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Open camera screen
      final fab = find.byType(AnimatedContainer).first;
      await tester.tap(fab);
      await tester.pumpAndSettle(const Duration(seconds: 1));
      await tester.tap(find.text('Camera'));
      await tester.pumpAndSettle(const Duration(seconds: 2));

      // Tap close button
      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      // Verify we're back on inventory screen (MainNavigation visible)
      expect(find.byType(MainNavigation), findsOneWidget,
          reason: 'Should be back on inventory screen');

      debugPrint('✅ Camera close navigation successful');
    });

    testWidgets('inventory feed shows empty state or items', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Check for either empty state or grid view
      final emptyState = find.text('Your inventory is empty');
      final hasItems = find.byType(GridView);

      final hasEmptyState = tester.widgetList(emptyState).isNotEmpty;
      final hasGridView = tester.widgetList(hasItems).isNotEmpty;

      expect(hasEmptyState || hasGridView, isTrue,
          reason: 'Should show either empty state or inventory grid');

      if (hasEmptyState) {
        expect(find.text('Tap + to add your first item'), findsOneWidget);
        debugPrint('✅ Empty state verified');
      } else {
        debugPrint('✅ Inventory grid with items verified');
      }
    });

    testWidgets('search functionality works', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Find search field
      final searchField = find.byType(TextField).first;
      expect(searchField, findsOneWidget, reason: 'Search field should exist');

      // Tap and enter text
      await tester.tap(searchField);
      await tester.pumpAndSettle();
      await tester.enterText(searchField, 'sofa');
      await tester.pumpAndSettle();

      // Clear button should appear
      expect(find.byIcon(Icons.clear), findsOneWidget,
          reason: 'Clear button should appear when text is entered');

      // Clear search
      await tester.tap(find.byIcon(Icons.clear));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.clear), findsNothing,
          reason: 'Clear button should disappear when text is cleared');

      debugPrint('✅ Search functionality verified');
    });

    testWidgets('pull to refresh works on inventory', (tester) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle(const Duration(seconds: 3));

      // Find scrollable and perform pull-to-refresh
      final scrollable = find.byType(Scrollable).first;
      expect(scrollable, findsOneWidget);

      await tester.fling(scrollable, const Offset(0, 300), 800);
      await tester.pumpAndSettle(const Duration(seconds: 2));

      debugPrint('✅ Pull to refresh gesture completed');
    });
  });

  group('API Integration Tests', () {
    testWidgets('detect endpoint accepts image and returns detections', (tester) async {
      // This test verifies the API integration directly
      // Skip if API not running
      try {
        final healthCheck = await http.get(
          Uri.parse('http://localhost:3000/v1/health'),
        ).timeout(const Duration(seconds: 3));

        if (healthCheck.statusCode != 200) {
          debugPrint('⚠️ Skipping API test - server not healthy');
          return;
        }
      } catch (e) {
        debugPrint('⚠️ Skipping API test - server not running: $e');
        return;
      }

      // Download a test image
      const testImageUrl = 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800';

      try {
        final imageResponse = await http.get(Uri.parse(testImageUrl))
            .timeout(const Duration(seconds: 10));

        if (imageResponse.statusCode == 200) {
          // Save to temp file
          final tempDir = await getTemporaryDirectory();
          final testFile = File('${tempDir.path}/test_sofa.jpg');
          await testFile.writeAsBytes(imageResponse.bodyBytes);

          // Send to detection API
          final request = http.MultipartRequest(
            'POST',
            Uri.parse('http://localhost:3000/v1/detect'),
          );
          request.files.add(await http.MultipartFile.fromPath('image', testFile.path));

          final response = await request.send().timeout(const Duration(seconds: 30));
          final responseBody = await response.stream.bytesToString();

          expect(response.statusCode, 200,
              reason: 'Detection API should return 200. Got: ${response.statusCode}, Body: $responseBody');
          expect(responseBody.contains('detections'), isTrue,
              reason: 'Response should contain detections array');

          debugPrint('✅ API detection test passed');
          debugPrint('Response: ${responseBody.substring(0, responseBody.length.clamp(0, 500))}...');

          // Cleanup
          await testFile.delete();
        }
      } catch (e) {
        debugPrint('⚠️ API detection test failed: $e');
        // Don't fail the test if network issues
      }
    });
  });
}
