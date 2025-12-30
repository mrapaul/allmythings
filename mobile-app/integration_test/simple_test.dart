import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';

void main() {
  patrolTest(
    'simple test - just verify patrol works',
    ($) async {
      // Just pump a simple widget to verify Patrol is working
      await $.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(title: const Text('Test App')),
            body: const Center(
              child: Text('Hello Patrol'),
            ),
          ),
        ),
      );

      // Verify the simple widget is displayed
      expect($('Hello Patrol'), findsOneWidget);
      expect($('Test App'), findsOneWidget);
    },
  );
}
