import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/presentation/widgets/detection_box.dart';
import 'package:all_my_things/presentation/widgets/label_editor.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;

class DetectionResultsScreen extends ConsumerStatefulWidget {
  const DetectionResultsScreen({
    required this.imageFile,
    super.key,
  });
  final File imageFile;

  @override
  ConsumerState<DetectionResultsScreen> createState() =>
      _DetectionResultsScreenState();
}

class _DetectionResultsScreenState
    extends ConsumerState<DetectionResultsScreen> {
  List<Detection> _detections = [];
  bool _isLoading = true;
  img.Image? _image;
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _processImage();
  }

  Future<void> _processImage() async {
    try {
      // Load and decode the image
      final bytes = await widget.imageFile.readAsBytes();
      _image = img.decodeImage(bytes);

      // Process detections
      final result = await ref.read(
        imageDetectionsProvider(widget.imageFile).future,
      );

      if (mounted) {
        setState(() {
          _detections = result;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error processing image: $e')),
        );
        Navigator.of(context).pop();
      }
    }
  }

  Future<void> _saveItem() async {
    if (!_formKey.currentState!.validate()) return;

    try {
      final repositoryAsync = ref.read(inventoryRepositoryProvider);
      final repository = await repositoryAsync.when(
        data: (repo) async => repo,
        loading: () async => throw Exception('Repository still loading'),
        error: (error, _) async => throw error,
      );
      final result = await repository.createItem(
            name: _nameController.text,
            photoPath: widget.imageFile.path,
            thumbnailPath: widget.imageFile.path, // TODO: Generate a real thumbnail
            detections: _detections,
          );

      if (mounted) {
        result.fold(
          (error) => ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to save item: $error')),
          ),
          (itemId) {
            Navigator.of(context).pop(true); // Return success
          },
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save item: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Review Detection'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            onPressed: _saveItem,
          ),
        ],
      ),
      body: _isLoading || _image == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              child: Column(
                children: [
                  // Image with detection boxes
                  SizedBox(
                    height: 300,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.file(widget.imageFile, fit: BoxFit.cover),
                        ..._detections.map(
                          (detection) => DetectionBox(
                            detection: detection,
                            imageSize: Size(
                              _image!.width.toDouble(),
                              _image!.height.toDouble(),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Item details form
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextFormField(
                            controller: _nameController,
                            decoration: const InputDecoration(
                              labelText: 'Item Name',
                              border: OutlineInputBorder(),
                            ),
                            validator: (value) => value?.isEmpty ?? true
                                ? 'Please enter a name'
                                : null,
                          ),
                          const SizedBox(height: 16),
                          LabelEditor(
                            initialLabels: const [],
                            onLabelsChanged: (labels) {
                              // _selectedLabel = labels.isNotEmpty ? labels.first : null;
                            },
                          ),
                          const SizedBox(height: 8),
                          if (_detections.isNotEmpty) ...[
                            const Text(
                              'Detected Objects:',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                            Wrap(
                              spacing: 8,
                              children: _detections
                                  .map(
                                    (d) => Chip(
                                      label: Text(
                                        '${d.label} (${(d.confidence * 100).toStringAsFixed(1)}%)',
                                      ),
                                      backgroundColor: Colors.blue.withAlpha(
                                        (255 * 0.2).round(),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
