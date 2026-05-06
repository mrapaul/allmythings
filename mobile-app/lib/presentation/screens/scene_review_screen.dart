/// Scene-review: between capture and inventory persistence.
///
/// Flow (unchanged from legacy):
///   1. Camera capture pushes here with the captured File.
///   2. We call DetectionApi.detectScene, showing an "analyzing" overlay.
///   3. User toggles which detected items to keep, then taps Save.
///   4. Only checked items get persisted to Drift.
///
/// Detection logic + persistence path are intentionally preserved.
/// The chrome (cards, chips, buttons) is restyled to the Disney+
/// palette and Fraunces/Inter typography, plus the GlowBackdrop ambient
/// surface.
library;

import 'dart:io';

import 'package:all_my_things/application/providers/detection_api_provider.dart';
import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/application/providers/service_providers.dart';
import 'package:all_my_things/domain/models/detected_object.dart' show BoundingBox;
import 'package:all_my_things/domain/models/scene_observation.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:all_my_things/presentation/widgets/glow_backdrop.dart';
import 'package:all_my_things/presentation/widgets/primary_button.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class SceneReviewScreen extends ConsumerStatefulWidget {
  const SceneReviewScreen({required this.imageFile, super.key});
  final File imageFile;

  @override
  ConsumerState<SceneReviewScreen> createState() => _SceneReviewScreenState();
}

class _SceneReviewScreenState extends ConsumerState<SceneReviewScreen> {
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorMessage;
  SceneObservation? _scene;
  final Map<String, bool> _included = {};

  @override
  void initState() {
    super.initState();
    _runDetect();
  }

  Future<void> _runDetect() async {
    try {
      final api = ref.read(detectionApiProvider);
      final scene = await api.detectScene(widget.imageFile);
      if (!mounted) return;
      setState(() {
        _scene = scene;
        _isLoading = false;
        for (final det in scene.detections) {
          _included[det.id] = true;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _saveSelected() async {
    final scene = _scene;
    if (scene == null) return;
    final selected =
        _included.entries.where((e) => e.value).map((e) => e.key).toSet();
    if (selected.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select at least one item to save')),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      final filtered = scene.copyWith(
        detections:
            scene.detections.where((d) => selected.contains(d.id)).toList(),
      );
      final inv = await ref.read(inventoryRepositoryProvider.future);
      final imgSvc = ref.read(imageProcessingServiceProvider);
      final thumb = await imgSvc.generateThumbnail(
        widget.imageFile,
        const BoundingBox(x: 0, y: 0, width: 1, height: 1),
      );
      await inv.persistScene(
        observation: filtered,
        photoPath: widget.imageFile.path,
        thumbnailPath: thumb.path,
      );
      ref.invalidate(inventoryItemsProvider);
      ref.invalidate(inventoryStatsProvider);
      if (mounted) context.go('/items');
    } catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Save failed: $e')),
        );
      }
    }
  }

  void _discard() {
    if (mounted) context.go('/items');
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final scene = _scene;
    final allCount = scene?.detections.length ?? 0;
    final includedCount = _included.values.where((v) => v).length;

    return Scaffold(
      backgroundColor: p.background,
      body: Stack(
        children: [
          const Positioned.fill(child: GlowBackdrop()),
          SafeArea(
            child: Column(
              children: [
                _Header(
                  title: _isLoading
                      ? 'Analyzing'
                      : _errorMessage != null
                          ? 'Detection failed'
                          : 'Review',
                  subtitle: _isLoading || _errorMessage != null
                      ? null
                      : '$includedCount of $allCount items',
                  onClose: _discard,
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    children: [
                      _PhotoPreview(file: widget.imageFile, isLoading: _isLoading),
                      const SizedBox(height: 16),
                      _buildBody(),
                    ],
                  ),
                ),
                if (!_isLoading && _errorMessage == null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(48),
                              side: BorderSide(color: p.border),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            onPressed: _isSaving ? null : _discard,
                            child: Text(
                              'Discard',
                              style: AppTypography.inter(
                                size: 14,
                                weight: FontWeight.w600,
                                color: p.foreground,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: PrimaryButton(
                            label: _isSaving
                                ? 'Saving…'
                                : 'Save $includedCount item${includedCount == 1 ? '' : 's'}',
                            icon: _isSaving ? null : Icons.check_rounded,
                            onPressed: _isSaving || includedCount == 0
                                ? null
                                : _saveSelected,
                            height: 48,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    final p = context.palette;
    if (_isLoading) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
        child: Text(
          'Analyzing the photo with the on-device detection ensemble. '
          'Hang on a moment.',
          style: AppTypography.inter(
            size: 14,
            color: p.mutedForeground,
            height: 1.5,
          ),
        ),
      );
    }
    if (_errorMessage != null) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: p.card,
          border: Border.all(color: p.border),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Detection failed',
              style: AppTypography.fraunces(
                size: 18,
                weight: FontWeight.w600,
                color: p.foreground,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage!,
              style: AppTypography.inter(
                size: 13,
                color: p.destructive,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    label: 'Retry',
                    icon: Icons.refresh,
                    onPressed: () {
                      setState(() {
                        _isLoading = true;
                        _errorMessage = null;
                      });
                      _runDetect();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: PrimaryButton(
                    label: 'Cancel',
                    style: PrimaryButtonStyle.secondary,
                    onPressed: _discard,
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    }
    final scene = _scene;
    if (scene == null || scene.detections.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
        child: Text(
          'No items detected in this photo. Try reframing and capturing again.',
          style: AppTypography.inter(
            size: 14,
            color: p.mutedForeground,
            height: 1.5,
          ),
        ),
      );
    }
    return Column(
      children: [
        for (final det in scene.detections)
          _DetectionRow(
            detection: det,
            included: _included[det.id] ?? true,
            onToggle: (v) => setState(() => _included[det.id] = v),
          ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.title, required this.subtitle, required this.onClose});
  final String title;
  final String? subtitle;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: Material(
              color: p.card,
              shape: CircleBorder(side: BorderSide(color: p.border)),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onClose,
                child: Center(
                  child: Icon(Icons.close_rounded, size: 18, color: p.foreground),
                ),
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: AppTypography.fraunces(
                      size: 22,
                      weight: FontWeight.w600,
                      color: p.foreground,
                      letterSpacing: -0.3,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: AppTypography.inter(
                        size: 12,
                        color: p.mutedForeground,
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _PhotoPreview extends StatelessWidget {
  const _PhotoPreview({required this.file, required this.isLoading});
  final File file;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(color: p.border),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Image.file(file, fit: BoxFit.cover),
            ),
            if (isLoading)
              ColoredBox(
                color: const Color(0xFF13122E).withValues(alpha: 0.55),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CupertinoActivityIndicator(color: Colors.white),
                      const SizedBox(height: 12),
                      Text(
                        'Detecting items…',
                        style: AppTypography.fraunces(
                          size: 16,
                          weight: FontWeight.w500,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'this can take 25–45s on first run',
                        style: AppTypography.inter(
                          size: 12,
                          color: Colors.white70,
                        ),
                      ),
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

class _DetectionRow extends StatelessWidget {
  const _DetectionRow({
    required this.detection,
    required this.included,
    required this.onToggle,
  });

  final PipelineDetection detection;
  final bool included;
  final ValueChanged<bool> onToggle;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final attrs = detection.vlmStructuredAttributes;
    final name = (attrs['name'] as String?)?.trim();
    final category = (attrs['category'] as String?)?.trim();
    final value = (attrs['estimated_value'] as String?)?.trim();
    final pieces = <String>[
      if (category != null && category.isNotEmpty) category,
      if (value != null && value.isNotEmpty) value,
      'agreement ${detection.agreementScore.toStringAsFixed(0)}',
    ];

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: included ? p.card : p.muted,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => onToggle(!included),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                Checkbox(
                  value: included,
                  onChanged: (v) => onToggle(v ?? false),
                  activeColor: p.primary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name?.isNotEmpty == true
                            ? name!
                            : detection.primaryLabel,
                        style: AppTypography.fraunces(
                          size: 16,
                          weight: FontWeight.w600,
                          color: p.foreground,
                          letterSpacing: -0.2,
                        ),
                      ),
                      if (pieces.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          pieces.join(' · '),
                          style: AppTypography.inter(
                            size: 12,
                            color: p.mutedForeground,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
