import 'dart:io';

import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/presentation/widgets/detection_box.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
  img.Image? _image;
  final Set<int> _selectedIndices = {};
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _loadImageAndDetect();
  }

  Future<void> _loadImageAndDetect() async {
    try {
      final bytes = await widget.imageFile.readAsBytes();
      _image = img.decodeImage(bytes);

      // Trigger detection
      await ref
          .read(detectionProvider.notifier)
          .detectObjects(widget.imageFile);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error processing image: $e')),
        );
      }
    }
  }

  Future<void> _saveSelected(List<DetectedObject> detections) async {
    if (_selectedIndices.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one object')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final notifier = ref.read(inventoryItemsProvider.notifier);

      for (final index in _selectedIndices) {
        await notifier.saveDetection(
          photoPath: widget.imageFile.path,
          thumbnailPath: widget.imageFile.path,
          detection: detections[index],
        );
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Saved ${_selectedIndices.length} item(s) to inventory',
            ),
          ),
        );
        context.go('/items');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final detectionState = ref.watch(detectionProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detection Results'),
      ),
      body: switch (detectionState) {
        DetectionInitial() =>
          const Center(child: CircularProgressIndicator()),
        DetectionLoading() => const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Detecting objects...'),
              ],
            ),
          ),
        DetectionSuccess(
          :final detections,
          :final processingTimeMs,
          :final detector,
          :final classifier,
        ) =>
          _buildSuccessContent(
            detections,
            processingTimeMs,
            detector,
            classifier,
          ),
        DetectionEmpty() => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.search_off, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                const Text('No objects detected'),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => context.pop(),
                  child: const Text('Go Back'),
                ),
              ],
            ),
          ),
        DetectionError(:final message) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 64,
                  color: Colors.red,
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    'Detection failed: $message',
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _loadImageAndDetect,
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _buildSuccessContent(
    List<DetectedObject> detections,
    int processingTimeMs,
    String detector,
    String classifier,
  ) {
    // Select all by default on first load
    if (_selectedIndices.isEmpty && detections.isNotEmpty) {
      for (var i = 0; i < detections.length; i++) {
        _selectedIndices.add(i);
      }
    }

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Image with bounding boxes
                SizedBox(
                  height: 300,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.file(widget.imageFile, fit: BoxFit.cover),
                      if (_image != null)
                        ...detections.map(
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

                // Metadata bar
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Text(
                    '${detections.length} object(s) found in ${processingTimeMs}ms '
                    '($detector / $classifier)',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.grey,
                        ),
                  ),
                ),

                // Detected objects list with checkboxes
                ...List.generate(detections.length, (index) {
                  final detection = detections[index];
                  final isSelected = _selectedIndices.contains(index);

                  return _DetectionListItem(
                    detection: detection,
                    isSelected: isSelected,
                    onToggle: () {
                      setState(() {
                        if (isSelected) {
                          _selectedIndices.remove(index);
                        } else {
                          _selectedIndices.add(index);
                        }
                      });
                    },
                  );
                }),
              ],
            ),
          ),
        ),

        // Save button
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed:
                    _isSaving ? null : () => _saveSelected(detections),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: _isSaving
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        'Save ${_selectedIndices.length} to Inventory',
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// List item for a detected object with checkbox
class _DetectionListItem extends StatelessWidget {
  const _DetectionListItem({
    required this.detection,
    required this.isSelected,
    required this.onToggle,
  });

  final DetectedObject detection;
  final bool isSelected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: isSelected,
      onChanged: (_) => onToggle(),
      title: Text(
        detection.label,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${detection.category} - '
            '${(detection.confidence * 100).toStringAsFixed(1)}% confidence',
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              if (detection.brand != null)
                _AttributeChip('Brand: ${detection.brand!}'),
              if (detection.model != null)
                _AttributeChip('Model: ${detection.model!}'),
              ...detection.colors.map((c) => _AttributeChip(c)),
              ...detection.materials.map((m) => _AttributeChip(m)),
              if (detection.condition != null)
                _AttributeChip(detection.condition!),
            ],
          ),
        ],
      ),
      isThreeLine: true,
    );
  }
}

class _AttributeChip extends StatelessWidget {
  const _AttributeChip(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label, style: const TextStyle(fontSize: 11)),
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}
