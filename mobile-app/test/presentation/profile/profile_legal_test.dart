import 'package:all_my_things/presentation/screens/about_screen.dart';
import 'package:all_my_things/presentation/screens/legal_document_screen.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('AboutScreen displays app information', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: const AboutScreen(),
    ));
    await tester.pump();

    expect(find.text('All My Things'), findsOneWidget);
    expect(find.text('Version 0.1.0 (Beta)'), findsOneWidget);
    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.text('Terms of Service'), findsOneWidget);
  });

  testWidgets('LegalDocumentScreen displays title', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light(),
      home: const LegalDocumentScreen(
        title: 'Test Policy',
        assetPath: 'assets/legal/privacy_policy.md',
      ),
    ));
    await tester.pump();

    expect(find.text('Test Policy'), findsOneWidget);
  });
}
