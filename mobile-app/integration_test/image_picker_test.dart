import 'dart:io';

import 'package:all_my_things/application/providers/image_picker_provider.dart';
import 'package:all_my_things/presentation/screens/camera_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:image_picker/image_picker.dart';

class MockImagePicker extends Mock implements ImagePicker {}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late MockImagePicker mockImagePicker;

  setUp(() {
    mockImagePicker = MockImagePicker();
  });

  testWidgets('Camera and Gallery buttons trigger ImagePicker',
      (WidgetTester tester) async {
    when(() => mockImagePicker.pickImage(source: ImageSource.camera))
        .thenAnswer((_) async => XFile('test_images/sample.jpg'));
    when(() => mockImagePicker.pickImage(source: ImageSource.gallery))
        .thenAnswer((_) async => XFile('test_images/sample.jpg'));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          imagePickerProvider.overrideWithValue(mockImagePicker),
        ],
        child: const MaterialApp(
          home: CameraScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Tap the gallery button
    await tester.tap(find.byIcon(Icons.photo_library));
    await tester.pumpAndSettle();

    // Verify that pickImage with gallery source was called
    verify(() => mockImagePicker.pickImage(source: ImageSource.gallery))
        .called(1);

    // Tap the camera button
    await tester.tap(find.byIcon(Icons.camera_alt));
    await tester.pumpAndSettle();

    // Verify that pickImage with camera source was called
    verify(() => mockImagePicker.pickImage(source: ImageSource.camera))
        .called(1);
  });
}
