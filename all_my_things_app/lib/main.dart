import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'models/detection.dart';
import 'providers/detection_provider.dart';

void main() {
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'All My Things',
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
  bool _isLoading = false;

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: source);

    if (pickedFile != null) {
      setState(() {
        _imageFile = File(pickedFile.path);
        _isLoading = true;
      });

      final result = await ref.read(imageDetectionsProvider(_imageFile!).future);
      setState(() {
        _detections = result;
        _isLoading = false;
      });
    }
  }

  void _showImageSourceDialog() {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: <Widget>[
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Gallery'),
              onTap: () {
                _pickImage(ImageSource.gallery);
                Navigator.of(context).pop();
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Camera'),
              onTap: () {
                _pickImage(ImageSource.camera);
                Navigator.of(context).pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('All My Things'),
      ),
      body: Center(
        child: _isLoading
            ? const CircularProgressIndicator()
            : _imageFile == null
                ? const Text('No image selected.')
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
      floatingActionButton: FloatingActionButton(
        onPressed: _showImageSourceDialog,
        tooltip: 'Add Image',
        child: const Icon(Icons.add_a_photo),
      ),
    );
  }
}