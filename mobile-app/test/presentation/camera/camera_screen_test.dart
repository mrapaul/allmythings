import 'package:fpdart/fpdart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:camera/camera.dart';
import 'package:home_inventory/presentation/camera/camera_screen.dart';
import 'package:home_inventory/application/providers/camera_providers.dart';
import 'package:home_inventory/domain/services/photo_capture_service.dart';

/**
 * T048 [P] [US1] Widget test for camera screen
 *
 * Purpose: Validate camera screen UI and interactions
 *
 * Success Criteria:
 * - Renders camera preview when permission granted
 * - Shows permission request when permission denied
 * - Capture button visible and tappable
 * - Shows loading state during capture
 * - Navigates to detection results on success
 * - Shows error dialog on capture failure
 */

class MockCameraController extends Mock implements CameraController {}
class MockCameraService extends Mock implements PhotoCaptureService {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MockCameraController mockController;
  late MockCameraService mockCameraService;

  setUp(() {
    mockController = MockCameraController();
    mockCameraService = MockCameraService();
  });

  // Helper to create testable widget with providers
  Widget createTestWidget({
    bool hasPermission = true,
    bool isInitialized = true,
  }) {
    return ProviderScope(
      overrides: [
        photoCaptureServiceProvider.overrideWithValue(mockCameraService),
      ],
      child: const MaterialApp(
        home: CameraScreen(),
      ),
    );
  }

  group('CameraScreen Widget Tests', () {
    testWidgets('should render camera preview when permission granted', (tester) async {
      // Arrange: Mock camera permission and initialization
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => Right(mockController));
      when(() => mockController.value).thenReturn(
        const CameraValue(
          isInitialized: true,
          isRecordingVideo: false,
          isTakingPicture: false,
          isStreamingImages: false,
          previewSize: Size(1920, 1080),
        ),
      );

      // Act: Build widget
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // Assert: Camera preview visible
      expect(find.byType(CameraPreview), findsOneWidget);
      expect(find.byIcon(Icons.circle), findsOneWidget); // Capture button
    });

    testWidgets('should show permission request when permission denied', (tester) async {
      // Arrange: Mock permission denied
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => false);

      // Act: Build widget
      await tester.pumpWidget(createTestWidget(hasPermission: false));
      await tester.pumpAndSettle();

      // Assert: Permission request UI shown
      expect(find.text('Camera Permission Required'), findsOneWidget);
      expect(find.text('Grant Permission'), findsOneWidget);
      expect(find.byType(CameraPreview), findsNothing);
    });

    testWidgets('should display capture button in center', (tester) async {
      // Arrange
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => Right(mockController));
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );

      // Act
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // Assert: Capture button positioned correctly
      final captureButton = find.byIcon(Icons.circle);
      expect(captureButton, findsOneWidget);

      // Check button is centered horizontally
      final buttonRect = tester.getRect(captureButton);
      final screenWidth = tester.getSize(find.byType(CameraScreen)).width;
      expect(buttonRect.center.dx, closeTo(screenWidth / 2, 10));
    });

    testWidgets('should show loading indicator during capture', (tester) async {
      // Arrange: Mock long capture operation
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => Right(mockController));
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );
      when(() => mockCameraService.takePicture()).thenAnswer(
        (_) async {
          await Future.delayed(const Duration(seconds: 2));
          return XFile('/path/to/image.jpg');
        },
      );

      // Act: Build widget and tap capture
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.circle));
      await tester.pump(); // Start async operation

      // Assert: Loading indicator shown
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Wait for completion
      await tester.pumpAndSettle();
    });

    testWidgets('should navigate to detection results on successful capture', (tester) async {
      // Arrange
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => Right(mockController));
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );
      when(() => mockCameraService.takePicture()).thenAnswer(
        (_) async => XFile('/path/to/image.jpg'),
      );

      // Act: Build widget and capture
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle();

      // Assert: Navigated to detection results screen
      expect(find.text('Detection Results'), findsOneWidget);
    });

    testWidgets('should show error dialog on capture failure', (tester) async {
      // Arrange: Mock capture failure
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => mockController);
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );
      when(() => mockCameraService.takePicture()).thenThrow(
        Exception('Camera capture failed'),
      );

      // Act: Build widget and attempt capture
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.circle));
      await tester.pumpAndSettle();

      // Assert: Error dialog shown
      expect(find.text('Capture Failed'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('should toggle flash mode when flash button tapped', (tester) async {
      // Arrange
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => mockController);
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, flashMode: FlashMode.off),
      );
      when(() => mockCameraService.setFlashMode(any())).thenAnswer((_) async {});

      // Act: Build widget and toggle flash
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      final flashButton = find.byIcon(Icons.flash_off);
      expect(flashButton, findsOneWidget);

      await tester.tap(flashButton);
      await tester.pumpAndSettle();

      // Assert: Flash toggled
      verify(() => mockCameraService.setFlashMode(FlashMode.auto)).called(1);
    });

    testWidgets('should show close button to exit camera', (tester) async {
      // Arrange
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => mockController);
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );

      // Act: Build widget
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // Assert: Close button visible
      final closeButton = find.byIcon(Icons.close);
      expect(closeButton, findsOneWidget);

      // Tap close
      await tester.tap(closeButton);
      await tester.pumpAndSettle();

      // Assert: Navigation popped (back to previous screen)
      expect(find.byType(CameraScreen), findsNothing);
    });

    testWidgets('should dispose camera controller on exit', (tester) async {
      // Arrange
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenAnswer((_) async => mockController);
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );
      when(() => mockCameraService.dispose()).thenAnswer((_) async {});

      // Act: Build widget and exit
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      // Assert: Camera disposed
      verify(() => mockCameraService.dispose()).called(1);
    });

    testWidgets('should handle camera initialization error gracefully', (tester) async {
      // Arrange: Mock initialization failure
      when(() => mockCameraService.hasPermission()).thenAnswer((_) async => true);
      when(() => mockCameraService.initialize()).thenThrow(
        Exception('Camera initialization failed'),
      );

      // Act: Build widget
      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // Assert: Error state shown
      expect(find.text('Camera Error'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('should request permission when "Grant Permission" tapped', (tester) async {
      // Arrange: Initially no permission
      when(() => mockCameraService.hasPermission())
        .thenAnswer((_) async => false);
      when(() => mockCameraService.requestPermission())
        .thenAnswer((_) async => true);
      when(() => mockCameraService.initialize())
        .thenAnswer((_) async => mockController);
      when(() => mockController.value).thenReturn(
        const CameraValue(isInitialized: true, isRecordingVideo: false, isTakingPicture: false, isStreamingImages: false),
      );

      // Act: Build widget and grant permission
      await tester.pumpWidget(createTestWidget(hasPermission: false));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Grant Permission'));
      await tester.pumpAndSettle();

      // Assert: Permission requested and camera initialized
      verify(() => mockCameraService.requestPermission()).called(1);
      verify(() => mockCameraService.initialize()).called(1);
      expect(find.byType(CameraPreview), findsOneWidget);
    });
  });
}
