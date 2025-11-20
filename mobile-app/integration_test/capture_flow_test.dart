import 'dart:io';
import 'package:flutter/services.dart'; // For rootBundle
import 'package:path_provider/path_provider.dart'; // For getTemporaryDirectory

import 'package:all_my_things/application/providers/image_picker_provider.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart'; // For appDatabaseProvider
import 'package:all_my_things/data/database/app_database.dart';
import 'package:all_my_things/main.dart' as app;
import 'package:all_my_things/presentation/screens/home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../test/test_helpers/test_helpers.dart';

/// T050 [P] [US1] Integration test for photo capture flow
///
/// Purpose: Validate end-to-end camera → detection → save → feed workflow
///
/// Success Criteria:
/// - Navigate to camera from home screen
/// - Capture photo successfully
/// - Receive detection results from API
/// - Save detections to local database
/// - View item in inventory feed
/// - All state transitions work correctly

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Photo Capture Flow Integration Tests', () {
    late AppDatabase database;
    late MockImagePickerService mockImagePickerService;

    setUp(() async {
      database = AppDatabase.inMemory();
      mockImagePickerService = MockImagePickerService();
      // Provide a mock image file
      final byteData = await rootBundle.load('test_images/laptop.jpg');
      final buffer = byteData.buffer;
      final tempDir = await getTemporaryDirectory();
      final tempFile = File('${tempDir.path}/mock_image.jpg');
      await tempFile.writeAsBytes(
          buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes));

      when(() => mockImagePickerService.pickImageFromGallery(any()))
          .thenAnswer((_) async => tempFile);
      when(() => mockImagePickerService.takePicture(any()))
          .thenAnswer((_) async => tempFile);
    });

    tearDown(() async {
      await database.close();
    });

    testWidgets('complete capture flow: gallery → detect → save → feed',
        (tester) async {
      // Arrange: Launch app with test database and mock image picker
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            databaseProvider.overrideWithValue(database),
            imagePickerServiceProvider.overrideWithValue(mockImagePickerService),
          ],
          child: const app.MyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Assert: Start on home screen
      expect(find.byType(HomeScreen), findsOneWidget);

      // Act: Tap camera button
      final cameraButton = find.byIcon(Icons.camera_alt);
      expect(cameraButton, findsOneWidget);
      await tester.tap(cameraButton);
      await tester.pumpAndSettle();

      // Act: Tap gallery button
      final galleryButton = find.byIcon(Icons.photo_library);
      expect(galleryButton, findsOneWidget);
      await tester.tap(galleryButton);
      await tester.pumpAndSettle(const Duration(seconds: 10));

      // Assert: Detection results screen displayed
      expect(find.text('Detection Results'), findsOneWidget);
      expect(find.text('Detected Objects'), findsOneWidget);

      // Verify detection displayed (actual object depends on test image)
      final detectionCards = find.byType(Card);
      expect(detectionCards.evaluate().length, greaterThan(0));

      // Act: Save detections by tapping Done
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      // Assert: Navigated back to home feed
      expect(find.byType(HomeScreen), findsOneWidget);

      // Assert: Item now appears in feed
      final listItems = find.byType(ListTile);
      expect(listItems, findsOneWidget);

      // Verify database contains saved item
      final items = await database.select(database.inventoryItems).get();
      expect(items.length, 1);
      expect(items.first.photoPath, isNotEmpty);

      // Verify labels created
      final labels = await database.select(database.labels).get();
      expect(labels.length, greaterThan(0));
    });
  });
}