import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fpdart/fpdart.dart';
import 'package:home_inventory/core/errors/failures.dart';
import 'package:home_inventory/domain/services/photo_capture_service.dart';
import 'package:mockito/mockito.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

// Mocks
class MockCameraController extends Mock implements CameraController {}

class MockCameraDescription extends Mock implements CameraDescription {}

class MockXFile extends Mock implements XFile {}

class MockDirectory extends Mock implements Directory {}

class MockFile extends Mock implements File {}

class MockPermissionStatus extends Mock implements PermissionStatus {}

// Mock path_provider's getApplicationDocumentsDirectory
// This requires a bit of a workaround as it's a top-level function.
// We'll mock the behavior of the underlying platform channel.
// For simplicity in this test, we'll assume it returns a valid path.

void main() {
  group('PhotoCaptureService', () {
    late PhotoCaptureService service;
    late MockCameraController mockCameraController;
    late MockCameraDescription mockCameraDescription;
    late MockXFile mockXFile;
    late MockDirectory mockDirectory;
    late MockFile mockFile;

    setUp(() {
      mockCameraController = MockCameraController();
      mockCameraDescription = MockCameraDescription();
      mockXFile = MockXFile();
      mockDirectory = MockDirectory();
      mockFile = MockFile();

      service = PhotoCaptureService();

      // Mock static methods/getters
      // Mock availableCameras
      when(availableCameras()).thenAnswer((_) async => [mockCameraDescription]);
      // Mock getApplicationDocumentsDirectory
      // This is a global function, so direct mocking is hard. We'll assume it works
      // or use a test package like `path_provider_platform_interface` for deeper mocking.
      // For now, we'll just ensure the service's logic handles the returned path.

      // Mock CameraController behavior
      when(mockCameraController.initialize()).thenAnswer((_) async => {});
      when(
        mockCameraController.value,
      ).thenReturn(CameraControllerValue(isInitialized: true));
      when(
        mockCameraController.takePicture(),
      ).thenAnswer((_) async => mockXFile);
      when(mockCameraController.dispose()).thenAnswer((_) async => {});
      when(mockCameraController.setFlashMode(any)).thenAnswer((_) async => {});

      // Mock XFile behavior
      when(mockXFile.path).thenReturn('/temp/path/temp_photo.jpg');

      // Mock Directory behavior
      when(mockDirectory.exists()).thenAnswer((_) async => true);
      when(
        mockDirectory.create(recursive: anyNamed('recursive')),
      ).thenAnswer((_) async => mockDirectory);

      // Mock File behavior
      when(mockFile.copy(any)).thenAnswer((_) async => mockFile);
      when(mockFile.path).thenReturn('/app/docs/photos/photo_123.jpg');

      // Mock Permission.camera.status and request
      when(
        Permission.camera.status,
      ).thenAnswer((_) async => PermissionStatus.granted);
      when(
        Permission.camera.request(),
      ).thenAnswer((_) async => PermissionStatus.granted);
    });

    test('initialize returns right on success', () async {
      final result = await service.initialize();
      expect(result.isRight(), true);
      verify(availableCameras()).called(1);
      expect(service.controller, isNotNull);
    });

    test('initialize returns Failure when no cameras available', () async {
      when(availableCameras()).thenAnswer((_) async => []);
      final result = await service.initialize();
      expect(result.isLeft(), true);
      result.fold(
        (l) => expect(l, const Failure.camera(message: 'No cameras available')),
        (r) => fail('Should have failed'),
      );
    });

    test('initialize returns Failure on camera initialization error', () async {
      when(
        mockCameraController.initialize(),
      ).thenThrow(CameraException('code', 'description'));
      // Need to re-setup service after mocking initialize to throw
      service = PhotoCaptureService();
      final result = await service.initialize();
      expect(result.isLeft(), true);
      result.fold(
        (l) => expect(l, isA<Failure>()),
        (r) => fail('Should have failed'),
      );
    });

    test('capturePhoto returns File on success', () async {
      // Mock getApplicationDocumentsDirectory to return a mock Directory
      // This is a simplified mock. In a real app, you'd use `path_provider_platform_interface`
      // to mock the platform channel directly.
      // For now, we'll assume getApplicationDocumentsDirectory returns a valid path string.
      // And then mock the Directory and File operations.
      when(
        getApplicationDocumentsDirectory(),
      ).thenAnswer((_) async => mockDirectory);
      when(mockDirectory.path).thenReturn('/app/docs');
      when(mockDirectory.exists()).thenAnswer((_) async => true);
      when(
        mockDirectory.create(recursive: anyNamed('recursive')),
      ).thenAnswer((_) async => mockDirectory);

      // Mock File constructor for the copy operation
      // This is also tricky. We'll mock the copy method on the returned XFile.
      when(mockXFile.saveTo(any)).thenAnswer((_) async => {});

      // Ensure service controller is initialized
      await service.initialize();

      final result = await service.capturePhoto();

      expect(result.isRight(), true);
      result.fold(
        (l) => fail('Should not have failed'),
        (r) => expect(r, isA<File>()),
      );
      verify(mockCameraController.takePicture()).called(1);
    });

    test('capturePhoto returns Failure when camera not initialized', () async {
      service =
          PhotoCaptureService(); // Reset service without initializing controller
      final result = await service.capturePhoto();
      expect(result.isLeft(), true);
      result.fold(
        (l) =>
            expect(l, const Failure.camera(message: 'Camera not initialized')),
        (r) => fail('Should have failed'),
      );
    });

    test('capturePhoto returns Failure on photo capture error', () async {
      await service.initialize();
      when(
        mockCameraController.takePicture(),
      ).thenThrow(CameraException('code', 'description'));

      final result = await service.capturePhoto();

      expect(result.isLeft(), true);
      result.fold(
        (l) => expect(l, isA<Failure>()),
        (r) => fail('Should have failed'),
      );
    });

    test('dispose disposes controller', () async {
      await service.initialize();
      await service.dispose();
      verify(mockCameraController.dispose()).called(1);
      expect(service.controller, isNull);
    });

    test('hasPermission returns true if granted', () async {
      when(
        Permission.camera.status,
      ).thenAnswer((_) async => PermissionStatus.granted);
      expect(await service.hasPermission(), true);
    });

    test('hasPermission returns false if denied', () async {
      when(
        Permission.camera.status,
      ).thenAnswer((_) async => PermissionStatus.denied);
      expect(await service.hasPermission(), false);
    });

    test('requestPermission returns true if granted', () async {
      when(
        Permission.camera.request(),
      ).thenAnswer((_) async => PermissionStatus.granted);
      expect(await service.requestPermission(), true);
    });

    test('requestPermission returns false if denied', () async {
      when(
        Permission.camera.request(),
      ).thenAnswer((_) async => PermissionStatus.denied);
      expect(await service.requestPermission(), false);
    });

    test('setFlashMode sets flash mode on controller', () async {
      await service.initialize();
      await service.setFlashMode(FlashMode.always);
      verify(mockCameraController.setFlashMode(FlashMode.always)).called(1);
    });

    test('setFlashMode does nothing if controller not initialized', () async {
      service =
          PhotoCaptureService(); // Reset service without initializing controller
      await service.setFlashMode(FlashMode.always);
      verifyNever(mockCameraController.setFlashMode(any));
    });
  });
}
