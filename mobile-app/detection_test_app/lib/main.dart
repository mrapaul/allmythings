import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'models/detection.dart';
import 'providers/detection_providers.dart';

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Detection Test App',
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: const MyHomePage(),
    );
  }
}

class MyHomePage extends ConsumerStatefulWidget {
  const MyHomePage({super.key});

  @override
  ConsumerState<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends ConsumerState<MyHomePage> {
  File? _imageFile;
  List<Detection> _detections = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  Future<void> _loadImage() async {
    final imagePath = '~/Downloads/Images/ai_interior.jpg'.replaceAll('~', Platform.environment['HOME']!);
    final imageFile = File(imagePath);

    if (await imageFile.exists()) {
      setState(() {
        _imageFile = imageFile;
        _isLoading = true;
      });

      final result = await ref.read(imageDetectionsProvider(_imageFile!).future);
      setState(() {
        _detections = result;
        _isLoading = false;
      });
    } else {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Detection Test App'),
      ),
      body: Center(
        child: _isLoading
            ? const CircularProgressIndicator()
            : _imageFile == null
                ? const Text('Image not found at ~/Downloads/Images/ai_interior.jpg')
                : Stack(
                    children: [
                      Image.file(_imageFile!),
                      ..._detections.map((detection) {
                        return Positioned(
                          left: detection.boundingBox.x,
                          top: detection.boundingBox.y,
                          width: detection.boundingBox.width,
                          height: detection.boundingBox.height,
                          child: Container(
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: Colors.red,
                                width: 2,
                              ),
                            ),
                            child: Text(
                              '${detection.label} (${(detection.confidence * 100).toStringAsFixed(1)}%)',
                              style: const TextStyle(
                                backgroundColor: Colors.red,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
      ),
    );
  }
}
