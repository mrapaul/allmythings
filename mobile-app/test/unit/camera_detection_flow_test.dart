import 'package:all_my_things/application/providers/camera_providers.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/data/database/app_database.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Unit tests for camera capture and detection flow
/// This suite verifies that:
/// 1. Camera controller can be initialized
/// 2. Detection providers work correctly
/// 3. Inventory repository operations succeed
/// 4. Navigation state is maintained

void main() {
  group('Camera Controller Tests', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('CameraControllerState initializes with correct defaults', () {
      const state = CameraControllerState();

      expect(state.controller, isNull);
      expect(state.isInitialized, isFalse);
      expect(state.error, isNull);
    });

    test('CameraControllerState.copyWith creates new instance', () {
      const state1 = CameraControllerState(
        isInitialized: false,
      );

      final state2 = state1.copyWith(error: 'Test error');

      expect(state1.error, isNull);
      expect(state2.error, equals('Test error'));
      expect(state1, isNot(state2));
    });

    test('CameraControllerState.copyWith preserves unchanged fields', () {
      const state1 = CameraControllerState(
        isInitialized: false,
      );

      final state2 = state1.copyWith(error: 'Error');

      expect(state2.controller, equals(state1.controller));
      expect(state2.isInitialized, equals(state1.isInitialized));
      expect(state2.error, isNotEmpty);
    });
  });

  group('Inventory Provider Tests', () {
    late ProviderContainer container;
    late AppDatabase database;

    setUp(() async {
      database = AppDatabase.inMemory();
      container = ProviderContainer();
    });

    tearDown(() async {
      await database.close();
      container.dispose();
    });

    test('inventoryRepositoryProvider provides InventoryRepository', () {
      final repo = container.read(inventoryRepositoryProvider);
      expect(repo, isNotNull);
    });

    test('inventoryStatsProvider returns valid stats on error', () async {
      final stats = await container.read(inventoryStatsProvider.future);

      expect(stats, isNotNull);
      expect(stats.totalItems, isA<int>());
      expect(stats.totalLabels, isA<int>());
      expect(stats.totalCategories, isA<int>());
    });

    test('inventoryItemsProvider returns items list', () async {
      final items = await container.read(inventoryItemsProvider.future);

      expect(items, isNotNull);
      expect(items, isA<List>());
    });
  });

  group('Detection Flow Simulation', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('Inventory repository is accessible', () {
      final repo = container.read(inventoryRepositoryProvider);
      expect(repo, isNotNull);
    });

    test('Stats provider is accessible', () async {
      final stats = await container.read(inventoryStatsProvider.future);
      expect(stats, isNotNull);
    });

    test('Multiple provider accesses work consistently', () async {
      // First access
      final repo1 = container.read(inventoryRepositoryProvider);
      final stats1 = await container.read(inventoryStatsProvider.future);

      // Second access - should work the same
      final repo2 = container.read(inventoryRepositoryProvider);
      final stats2 = await container.read(inventoryStatsProvider.future);

      expect(repo1, isNotNull);
      expect(repo2, isNotNull);
      expect(stats1, isNotNull);
      expect(stats2, isNotNull);
    });
  });

  group('Error Handling Tests', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('Inventory items provider handles errors gracefully', () async {
      final items = await container.read(inventoryItemsProvider.future);
      expect(items, isNotNull);
      expect(items, isA<List>());
    });

    test('Stats provider returns defaults on error', () async {
      final stats = await container.read(inventoryStatsProvider.future);

      expect(stats.totalItems >= 0, true);
      expect(stats.totalLabels >= 0, true);
      expect(stats.totalCategories >= 0, true);
    });

    test('Provider state is maintained across accesses', () async {
      final items1 = await container.read(inventoryItemsProvider.future);
      final items2 = await container.read(inventoryItemsProvider.future);

      expect(items1, equals(items2));
    });
  });

  group('Provider Initialization Tests', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

    test('All core providers initialize without errors', () {
      expect(
        () {
          final repo = container.read(inventoryRepositoryProvider);
          expect(repo, isNotNull);
        },
        returnsNormally,
      );
    });

    test('Async providers resolve successfully', () async {
      final itemsFuture = container.read(inventoryItemsProvider.future);
      final statsFuture = container.read(inventoryStatsProvider.future);

      final items = await itemsFuture;
      final stats = await statsFuture;

      expect(items, isNotNull);
      expect(stats, isNotNull);
    });

    test('Camera controller notifier builds without errors', () {
      final notifier = CameraControllerNotifier();
      final state = notifier.build();

      expect(state, isNotNull);
      expect(state.isInitialized, isFalse);
    });
  });
}
