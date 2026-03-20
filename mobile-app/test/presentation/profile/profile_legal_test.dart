import 'package:all_my_things/presentation/profile/about_screen.dart';
import 'package:all_my_things/presentation/profile/legal_document_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('AboutScreen displays app information', (tester) async {
    // Need a dummy Material app and Scaffold
    await tester.pumpWidget(const MaterialApp(home: AboutScreen()));

    expect(find.text('All My Things'), findsOneWidget);
    expect(find.text('Version 0.1.0 (Beta)'), findsOneWidget);
    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.text('Terms of Service'), findsOneWidget);
  });

  testWidgets('LegalDocumentScreen displays title', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: LegalDocumentScreen(
          title: 'Test Policy',
          assetPath: 'assets/legal/privacy_policy.md',
        ),
      ),
    );

    expect(find.text('Test Policy'), findsOneWidget);
  });
}
