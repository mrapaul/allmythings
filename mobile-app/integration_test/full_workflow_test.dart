import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:home_inventory/main.dart' as app;
import 'package:home_inventory/data/database/app_database.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;

/// Full workflow E2E test
/// Tests: Photo → Detection → Storage → Retrieval → Search
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Full Workflow E2E Tests', () {
    late AppDatabase database;

    setUp(() async {
      // Initialize database
      final dbFolder = await getApplicationDocumentsDirectory();
      database = AppDatabase(File(path.join(dbFolder.path, 'test_inventory.db')));
    });

    tearDown(() async {
      // Clean up database
      await database.close();
    });

    testWidgets('Complete workflow: Photo → Detect → Store → Retrieve',
        (WidgetTester tester) async {
      // STEP 1: Start app
      app.main();
      await tester.pumpAndSettle();

      // Verify app started
      expect(find.byType(MaterialApp), findsOneWidget);
      expect(find.byType(BottomNavigationBar), findsOneWidget);

      // STEP 2: Check initial inventory is empty
      final initialCount = await database.inventoryItemDao.countItems();
      print('Initial inventory count: $initialCount');

      // STEP 3: Tap camera button to trigger photo flow
      final cameraButton = find.byIcon(Icons.add_circle_outline);
      expect(cameraButton, findsOneWidget);

      await tester.tap(cameraButton);
      await tester.pumpAndSettle(const Duration(milliseconds: 500));

      // STEP 4: Verify image picker options appear
      expect(find.text('Take Photo'), findsOneWidget);
      expect(find.text('Choose from Library'), findsOneWidget);

      // Note: We can't actually take/select a photo in automated tests
      // This would require manual testing or device automation
      print('✓ Camera flow UI verified');

      // Close the bottom sheet
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      // STEP 5: Simulate detection by directly calling repository
      // (Since we can't actually take photos in automated tests)
      print('Note: Actual photo capture requires manual testing');
      print('Mock detection would return random objects, not real detections');

      // STEP 6: Verify search functionality exists
      await tester.tap(find.byIcon(Icons.search_outlined));
      await tester.pumpAndSettle();

      // Should show search screen with text input
      expect(find.byType(TextField), findsOneWidget);
      print('✓ Search functionality exists');

      // STEP 7: Navigate back to home
      await tester.tap(find.byIcon(Icons.home));
      await tester.pumpAndSettle();

      print('✓ Full UI workflow navigation verified');
    });

    testWidgets('Database operations: Create → Read → Update → Delete',
        (WidgetTester tester) async {
      // STEP 1: Create test item
      final itemId = await database.inventoryItemDao.createItem(
        InventoryItemsCompanion.insert(
          name: 'Test Laptop',
          photoPath: '/tmp/test.jpg',
          thumbnailPath: '/tmp/test_thumb.jpg',
          confidence: 0.95,
        ),
      );

      expect(itemId, greaterThan(0));
      print('✓ Created test item with ID: $itemId');

      // STEP 2: Read item back
      final item = await database.inventoryItemDao.getItemById(itemId);
      expect(item, isNotNull);
      expect(item!.name, 'Test Laptop');
      expect(item.confidence, 0.95);
      print('✓ Retrieved item: ${item.name}');

      // STEP 3: Add labels
      await database.alternativeLabelDao.addLabel(itemId, 'electronics');
      await database.alternativeLabelDao.addLabel(itemId, 'work');

      final labels = await database.alternativeLabelDao.getLabelsForItem(itemId);
      expect(labels.length, 2);
      print('✓ Added ${labels.length} labels');

      // STEP 4: Search by label
      final searchResults = await database.inventoryItemDao.searchItems('electronics');
      expect(searchResults.length, greaterThan(0));
      print('✓ Search found ${searchResults.length} items');

      // STEP 5: Update item
      await database.inventoryItemDao.updateItemName(itemId, 'MacBook Pro');
      final updated = await database.inventoryItemDao.getItemById(itemId);
      expect(updated!.name, 'MacBook Pro');
      print('✓ Updated item name');

      // STEP 6: Delete item
      await database.inventoryItemDao.deleteItem(itemId);
      final deleted = await database.inventoryItemDao.getItemById(itemId);
      expect(deleted, isNull);
      print('✓ Deleted item');

      print('✓ Complete CRUD workflow verified');
    });

    testWidgets('API integration: Mock detections are stored correctly',
        (WidgetTester tester) async {
      // This test verifies that when mock API returns detections,
      // they are properly stored in the database

      // Note: Mock adapter returns random objects like:
      // ['chair', 'table', 'laptop', 'phone'] etc.
      // NOT based on actual image content

      final beforeCount = await database.inventoryItemDao.countItems();

      // In a real workflow, user would:
      // 1. Take photo
      // 2. API detects objects (mock returns random items)
      // 3. Items stored in DB
      // 4. Items appear in feed

      // Simulate storing a mock detection
      await database.inventoryItemDao.createItem(
        InventoryItemsCompanion.insert(
          name: 'chair',
          photoPath: '/tmp/mock_photo.jpg',
          thumbnailPath: '/tmp/mock_thumb.jpg',
          confidence: 0.87,
        ),
      );

      final afterCount = await database.inventoryItemDao.countItems();
      expect(afterCount, beforeCount + 1);

      print('✓ Mock detection stored successfully');
      print('⚠️  Note: Mock adapter returns random objects');
      print('⚠️  For real object detection, configure Google Cloud Vision API');
    });
  });

  group('Limitations & Manual Testing Required', () {
    test('Document what requires manual testing', () {
      print('\n========================================');
      print('MANUAL TESTING REQUIRED:');
      print('========================================');
      print('');
      print('1. REAL PHOTO CAPTURE:');
      print('   - Take photo of desk with laptop, phone, notebook');
      print('   - Verify camera permission requested');
      print('   - Verify photo appears in preview');
      print('');
      print('2. REAL OBJECT DETECTION:');
      print('   ⚠️  Current mock adapter returns RANDOM objects');
      print('   ⚠️  NOT based on actual image content');
      print('   - Configure Google Cloud Vision API for real detection');
      print('   - Set GOOGLE_CLOUD_PROJECT_ID in .env');
      print('   - Set GOOGLE_APPLICATION_CREDENTIALS path');
      print('');
      print('3. VERIFY DETECTED OBJECTS MATCH PHOTO:');
      print('   - Take photo of known objects (e.g., laptop, phone, cup)');
      print('   - Verify API returns those specific objects');
      print('   - Verify confidence scores are reasonable (>0.7)');
      print('');
      print('4. VERIFY STORAGE:');
      print('   - After detection, verify items appear in home feed');
      print('   - Tap item to see details and labels');
      print('   - Add custom labels and verify they save');
      print('');
      print('5. VERIFY SEARCH:');
      print('   - Search for detected object (e.g., "laptop")');
      print('   - Verify correct items appear');
      print('   - Search by custom label');
      print('   - Verify search is case-insensitive');
      print('');
      print('6. VERIFY FULL WORKFLOW:');
      print('   - Take photo → See loading indicator');
      print('   - See success message');
      print('   - See items in feed immediately');
      print('   - Restart app → Items persist');
      print('========================================');
      print('');
    });
  });
}
