import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:all_my_things/core/detection/local_detection_service.dart';
import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/domain/models/ensemble_details.dart';
import 'package:all_my_things/domain/models/vision_provider.dart';
import 'package:flutter/foundation.dart';

/// Labels that are NOT suitable for home inventory
/// These are either structural elements, too vague, or not things people would inventory
const _excludedLabels = <String>{};

/// Simplify verbose labels to single words
const _labelSimplifications = <String, String>{};

/// Repository for on-device object detection using YOLO11n
/// No network required - runs entirely on device using CoreML (iOS) or TFLite (Android)
///
/// This implementation uses a custom platform channel to communicate with native
/// CoreML (iOS) or TFLite (Android) for fast on-device inference.
class LocalDetectionRepository {
  LocalDetectionRepository();

  final LocalDetectionService _detectionService = LocalDetectionService.instance;
  bool _isInitialized = false;

  /// Initialize the detection model
  /// Call this once before using detectObjects
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      final ready = await _detectionService.initialize();
      _isInitialized = ready;
      if (!ready) {
        debugPrint('LocalDetectionRepository: Model not ready');
      } else {
        final info = await _detectionService.getModelInfo();
        debugPrint(
          'LocalDetectionRepository: Initialized with ${info?.name ?? "unknown"} '
          '(${info?.type ?? "unknown"}, ${info?.classes ?? 0} classes)',
        );
      }
    } catch (e) {
      debugPrint('Failed to initialize local detection model: $e');
      rethrow;
    }
  }

  /// Check if model is initialized and ready
  bool get isInitialized => _isInitialized && _detectionService.isReady;

  /// Detect objects in image file using on-device YOLO model
  /// Returns a list of detected objects with confidence scores and bounding boxes
  Future<List<Detection>> detectObjects(File imageFile) async {
    if (!_isInitialized) {
      await initialize();
    }

    if (!_detectionService.isReady) {
      throw StateError('Local detection model not ready');
    }

    try {
      final stopwatch = Stopwatch()..start();

      // Get image dimensions for coordinate conversion
      final imageBytes = await imageFile.readAsBytes();
      final dimensions = await _decodeImageDimensions(imageBytes);
      final imageWidth = dimensions.width;
      final imageHeight = dimensions.height;

      // Run detection
      final localDetections = await _detectionService.detectFromFile(
        imageFile,
        width: imageWidth,
        height: imageHeight,
      );

      stopwatch.stop();
      debugPrint(
        'LocalDetectionRepository: Detected ${localDetections.length} objects '
        'in ${stopwatch.elapsedMilliseconds}ms',
      );

      // Convert to Detection model
      final detections = <Detection>[];
      for (final local in localDetections) {
        final detection = _convertToDetection(local, imageWidth, imageHeight);
        if (detection != null) {
          detections.add(detection);
        }
      }

      return detections;
    } catch (e) {
      debugPrint('Local detection error: $e');
      rethrow;
    }
  }

  /// Decode image to get dimensions
  Future<({int width, int height})> _decodeImageDimensions(Uint8List bytes) async {
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    return (width: image.width, height: image.height);
  }

  /// Convert LocalDetection to our Detection model
  /// Returns null for excluded labels or errors
  Detection? _convertToDetection(
    LocalDetection local,
    int imageWidth,
    int imageHeight,
  ) {
    try {
      // Get and normalize the label
      final rawLabel = local.label.toLowerCase().trim();

      // Simplify verbose labels to single words
      final simplifiedLabel = _labelSimplifications[rawLabel] ?? rawLabel;

      // Use normalized coordinates for bounding box
      final normalizedBox = local.normalizedBox;
      final double x;
      final double y;
      final double width;
      final double height;

      if (normalizedBox != null) {
        x = normalizedBox['x'] ?? 0.0;
        y = normalizedBox['y'] ?? 0.0;
        width = normalizedBox['width'] ?? 0.0;
        height = normalizedBox['height'] ?? 0.0;
      } else {
        // If native x/y are already normalized (<= 1.0), use them directly
        if (local.x <= 1.0 && local.width <= 1.0) {
          x = local.x;
          y = local.y;
          width = local.width;
          height = local.height;
        } else {
          // Fall back to pixel coordinates, normalize them
          x = local.x / imageWidth;
          y = local.y / imageHeight;
          width = local.width / imageWidth;
          height = local.height / imageHeight;
        }
      }

      return Detection(
        id: 'local-${DateTime.now().microsecondsSinceEpoch}-${simplifiedLabel.hashCode}-${x.toStringAsFixed(4)}',
        label: simplifiedLabel,
        confidence: local.confidence,
        boundingBox: BoundingBox(
          x: x,
          y: y,
          width: width,
          height: height,
        ),
        ensembleDetails: EnsembleDetails(
          providerAgreement: 1,
          confidenceByProvider: {VisionProvider.yoloLocal: local.confidence},
          labelConsensus: 'on-device',
        ),
        alternativeLabels: const [],
        createdAt: DateTime.now(),
      );
    } catch (e) {
      debugPrint('Error converting detection: $e');
      return null;
    }
  }

  /// Dispose of resources
  void dispose() {
    _isInitialized = false;
  }
}
