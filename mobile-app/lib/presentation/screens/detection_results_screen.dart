import 'dart:io';

import 'package:all_my_things/application/providers/detection_providers.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/application/providers/service_providers.dart';
import 'package:all_my_things/application/state/detection_state.dart';
import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:all_my_things/presentation/widgets/detection_box.dart';
import 'package:flutter/cupertino.dart';
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
      final inventoryNotifier = ref.read(inventoryItemsProvider.notifier);
      final imageService = ref.read(imageProcessingServiceProvider);

      for (final index in _selectedIndices) {
        final detection = detections[index];
        
        // Generate a cropped thumbnail for the specific detection
        final thumbnailFile = await imageService.generateThumbnail(
          widget.imageFile,
          detection.boundingBox,
        );

        await inventoryNotifier.saveDetection(
          photoPath: widget.imageFile.path,
          thumbnailPath: thumbnailFile.path,
          detection: detection,
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
      backgroundColor: Colors.white,
      appBar: detectionState is DetectionSuccess
          ? AppBar(
              title: const Text('Visual Identification',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20)),
              backgroundColor: Colors.white,
              elevation: 0,
              foregroundColor: Colors.black,
            )
          : null,
      body: switch (detectionState) {
        DetectionInitial() =>
          const Center(child: CircularProgressIndicator(color: Colors.black)),
        DetectionLoading() => const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(color: Colors.black),
                SizedBox(height: 24),
                Text('Corroborating AI layers...', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.black54)),
              ],
            ),
          ),
        DetectionSuccess(
          :final detections,
          :final processingTimeMs,
          :final detector,
          :final classifier,
          :final corroborationCount,
        ) =>
          _buildSuccessContent(
            detections,
            processingTimeMs,
            detector,
            classifier,
            corroborationCount,
          ),
        DetectionEmpty() => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.search_off_rounded, size: 80, color: Colors.grey),
                const SizedBox(height: 16),
                const Text('No identifiable items found', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => context.pop(),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.black, foregroundColor: Colors.white),
                  child: const Text('CAPTURE AGAIN'),
                ),
              ],
            ),
          ),
        DetectionError(:final message) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline_rounded, size: 80, color: Colors.redAccent),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text('Analysis failed: $message', textAlign: TextAlign.center),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loadImageAndDetect,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.black, foregroundColor: Colors.white),
                  child: const Text('RETRY ANALYSIS'),
                ),
              ],
            ),
          ),
      },
    );
  }

  Widget _buildSuccessContent(
    List<DetectedObject> detections,
    int processingTimeMs,
    String detector,
    String classifier,
    int? corroborationCount,
  ) {
    if (_selectedIndices.isEmpty && detections.isNotEmpty) {
      for (var i = 0; i < detections.length; i++) {
        _selectedIndices.add(i);
      }
    }

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Image with bounding boxes
                SizedBox(
                  height: 350,
                  width: double.infinity,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final displaySize = Size(constraints.maxWidth, 350);
                      return Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.file(widget.imageFile, fit: BoxFit.cover),
                          if (_image != null)
                            ...detections.map(
                              (detection) => DetectionBox(
                                detection: detection,
                                imageSize: Size(_image!.width.toDouble(), _image!.height.toDouble()),
                                displaySize: displaySize,
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),

                // Corroboration Metadata Bar
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
                  child: Row(
                    children: [
                      _InfoChip(
                        label: classifier.toUpperCase(),
                        icon: Icons.psychology_outlined,
                        color: Colors.blueAccent,
                      ),
                      const SizedBox(width: 8),
                      if (corroborationCount != null && corroborationCount > 0)
                        _InfoChip(
                          label: '$corroborationCount CORROBORATIONS',
                          icon: Icons.verified_user_rounded,
                          color: Colors.green.shade700,
                        ),
                      const Spacer(),
                      Text(
                        '${(processingTimeMs / 1000).toStringAsFixed(1)}s',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.black45, fontSize: 12),
                      ),
                    ],
                  ),
                ),

                const Divider(height: 1),

                // Detected objects list
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
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),

        // Save button
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, -5))],
          ),
          child: SafeArea(
            child: SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _isSaving ? null : () => _saveSelected(detections),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                ),
                child: _isSaving
                    ? const CupertinoActivityIndicator(color: Colors.white)
                    : Text(
                        'VAULT ${_selectedIndices.length} ITEMS',
                        style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2),
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.label, required this.icon, required this.color});
  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
        ],
      ),
    );
  }
}

class _DetectionListItem extends StatelessWidget {
  const _DetectionListItem({required this.detection, required this.isSelected, required this.onToggle});
  final DetectedObject detection;
  final bool isSelected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onToggle,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
              color: isSelected ? Colors.black : Colors.grey.shade300,
              size: 28,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(detection.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text('${detection.category} • ${(detection.confidence * 100).toInt()}% match', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (detection.condition != null) _AttrPill(detection.condition!),
                      ...detection.colors.take(2).map(_AttrPill.new),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttrPill extends StatelessWidget {
  const _AttrPill(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(6)),
      child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black54)),
    );
  }
}
