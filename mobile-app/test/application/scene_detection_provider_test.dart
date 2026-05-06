// SceneDetectionNotifier — section-08 single-path provider for the new
// SceneObservation flow. Mirrors DetectionNotifier but emits the typed
// scene state instead of legacy DetectedObject lists.
import 'dart:io';

import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/state/scene_detection_state.dart';
import 'package:all_my_things/data/repositories/detection_repository.dart';
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class _MockRepo extends Mock implements DetectionRepository {}

class _FakeFile extends Fake implements File {}

SceneObservation _scene([String id = 's-1']) => SceneObservation(
      sceneId: id,
      runId: 'r',
      processingMs: 99,
    );

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeFile());
  });

  late _MockRepo repo;
  late ProviderContainer container;

  setUp(() {
    repo = _MockRepo();
    container = ProviderContainer(
      overrides: [
        detectionRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(container.dispose);
  });

  Future<File> tempImage() async {
    final dir = Directory.systemTemp.createTempSync('scd');
    final f = File('${dir.path}/x.jpg');
    await f.writeAsBytes(const [0, 1, 2]);
    return f;
  }

  group('SceneDetectionNotifier', () {
    test('initial state is initial', () {
      final state = container.read(sceneDetectionProvider);
      expect(state, isA<SceneDetectionInitial>());
    });

    test('detectScene → loading → success(scene)', () async {
      when(() => repo.detectScene(any())).thenAnswer(
        (_) async => _scene('s-7'),
      );

      final notifier = container.read(sceneDetectionProvider.notifier);
      final f = await tempImage();

      final fut = notifier.detectScene(f);
      expect(container.read(sceneDetectionProvider),
          isA<SceneDetectionLoading>());
      await fut;
      final state = container.read(sceneDetectionProvider);
      expect(state, isA<SceneDetectionSuccess>());
      expect((state as SceneDetectionSuccess).observation.sceneId, 's-7');
      verify(() => repo.detectScene(any())).called(1);
    });

    test('detectScene failure → error state, exception rethrown', () async {
      when(() => repo.detectScene(any())).thenThrow(Exception('boom'));

      final notifier = container.read(sceneDetectionProvider.notifier);
      final f = await tempImage();

      await expectLater(notifier.detectScene(f), throwsException);
      expect(container.read(sceneDetectionProvider),
          isA<SceneDetectionError>());
    });

    test('reset clears back to initial', () {
      final notifier = container.read(sceneDetectionProvider.notifier);
      notifier.reset();
      expect(container.read(sceneDetectionProvider),
          isA<SceneDetectionInitial>());
    });
  });
}
