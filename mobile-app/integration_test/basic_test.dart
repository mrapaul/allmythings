import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('basic integration test - verify Flutter works', (tester) async {
    // Build a simple widget
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(title: const Text('Test App')),
          body: const Center(
            child: Text('Hello Integration Test'),
          ),
        ),
      ),
    );

    // Verify the widget is displayed
    expect(find.text('Hello Integration Test'), findsOneWidget);
    expect(find.text('Test App'), findsOneWidget);
  });
}
