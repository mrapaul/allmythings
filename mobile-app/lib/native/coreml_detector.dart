import 'dart:io';
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

  /// Returns true if the CoreML model is bundled and available.
  static Future<bool> isAvailable() async {
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Run YOLO inference on [imageFile]. Returns detected boxes with coarse labels.
  /// Confidence threshold 0.3 — cast wide net, VLM prunes false positives.
  static Future<List<CoreMLBox>> detect(File imageFile) async {
    final bytes = await imageFile.readAsBytes();
    try {
      final raw = await _channel.invokeMethod<List<dynamic>>(
        'detect',
        {'imageBytes': bytes},
      );
      if (raw == null) return [];
      return raw.map((item) {
        final m = Map<String, dynamic>.from(item as Map);
        final box = (m['box'] as List<dynamic>).cast<double>();
        return CoreMLBox(
          label: m['label'] as String,
          confidence: (m['confidence'] as num).toDouble(),
          boxIndex: (m['boxIndex'] as num).toInt(),
          x: box[0],
          y: box[1],
          width: box[2],
          height: box[3],
        );
      }).toList();
    } on PlatformException {
      return [];
    }
  }
}
