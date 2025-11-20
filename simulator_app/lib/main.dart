import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

final detectionProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, imagePath) async {
  final response = await http.post(
    Uri.parse('http://localhost:9100/detect'),
    body: jsonEncode({'imagePath': imagePath}),
  );
  if (response.statusCode == 200) {
    return jsonDecode(response.body);
  } else {
    throw Exception('Failed to detect objects');
  }
});

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Simulator App',
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: const MyHomePage(),
    );
  }
}

class MyHomePage extends ConsumerWidget {
  const MyHomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detectionResult = ref.watch(detectionProvider('path/to/image'));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Simulator App'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            ElevatedButton(
              onPressed: () {
                ref.refresh(detectionProvider('path/to/image'));
              },
              child: const Text('Take Photo'),
            ),
            ElevatedButton(
              onPressed: () {
                ref.refresh(detectionProvider('path/to/image'));
              },
              child: const Text('Select from Gallery'),
            ),
            detectionResult.when(
              data: (data) => Text('Detection: ${data['label']} (${data['confidence']})'),
              loading: () => const CircularProgressIndicator(),
              error: (error, stackTrace) => Text('Error: $error'),
            ),
          ],
        ),
      ),
    );
  }
}