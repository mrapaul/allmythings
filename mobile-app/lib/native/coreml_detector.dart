import 'dart:io';
import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/services.dart';

class CoreMLBox {
  const CoreMLBox({
    required this.label,
    required this.confidence,
    required this.boxIndex,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final String label;
  final double confidence;
  final int boxIndex;
  final double x;
  final double y;
  final double width;
  final double height;
}

class CoreMLDetector {
  static const _channel = MethodChannel('com.allmythings/coreml_detector');

  /// Test-only: set to bypass the platform channel in unit tests.
  /// Always reset to null in tearDown.
  @visibleForTesting
  static Future<List<CoreMLBox>> Function(File)? detectOverride;

  /// Returns true if the CoreML model is bundled and available.
  static Future<bool> isAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Run YOLO inference on [imageFile]. Returns detected boxes with coarse labels.
  /// Confidence threshold 0.3 — cast wide net, VLM prunes false positives.
  static Future<List<CoreMLBox>> detect(File imageFile) async {
    if (detectOverride != null) return detectOverride!(imageFile);
    final bytes = await imageFile.readAsBytes();
    try {
      final raw = await _channel.invokeMethod<List<dynamic>>(
        'detect',
        {'imageBytes': bytes},
      );
      if (raw == null) return [];
      return raw.map((item) {
        final m = Map<String, dynamic>.from(item as Map);
        final box = m['box'] as List<dynamic>;
        return CoreMLBox(
          label: m['label'] as String,
          confidence: (m['confidence'] as num).toDouble(),
          boxIndex: (m['boxIndex'] as num).toInt(),
          x: (box[0] as num).toDouble(),
          y: (box[1] as num).toDouble(),
          width: (box[2] as num).toDouble(),
          height: (box[3] as num).toDouble(),
        );
      }).toList();
    } catch (_) {
      return [];
    }
  }
}
