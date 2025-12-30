import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Result of a local on-device object detection
class LocalDetection {
  final String label;
  final double confidence;
  final double x;
  final double y;
  final double width;
  final double height;
  final Map<String, double>? normalizedBox;

  const LocalDetection({
    required this.label,
    required this.confidence,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    this.normalizedBox,
  });

  factory LocalDetection.fromMap(Map<String, dynamic> map) {
    final normalized = map['normalizedBox'] as Map<Object?, Object?>?;
    return LocalDetection(
      label: map['label'] as String? ?? 'unknown',
      confidence: (map['confidence'] as num?)?.toDouble() ?? 0.0,
      x: (map['x'] as num?)?.toDouble() ?? 0.0,
      y: (map['y'] as num?)?.toDouble() ?? 0.0,
      width: (map['width'] as num?)?.toDouble() ?? 0.0,
      height: (map['height'] as num?)?.toDouble() ?? 0.0,
      normalizedBox: normalized != null
          ? {
              'x': (normalized['x'] as num?)?.toDouble() ?? 0.0,
              'y': (normalized['y'] as num?)?.toDouble() ?? 0.0,
              'width': (normalized['width'] as num?)?.toDouble() ?? 0.0,
              'height': (normalized['height'] as num?)?.toDouble() ?? 0.0,
            }
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'label': label,
        'confidence': confidence,
        'x': x,
        'y': y,
        'width': width,
        'height': height,
        if (normalizedBox != null) 'normalizedBox': normalizedBox,
      };

  @override
  String toString() =>
      'LocalDetection(label: $label, confidence: ${(confidence * 100).toStringAsFixed(1)}%)';
}

/// Model info returned from native
class LocalModelInfo {
  final String name;
  final String type;
  final int classes;
  final bool isReady;

  const LocalModelInfo({
    required this.name,
    required this.type,
    required this.classes,
    required this.isReady,
  });

  factory LocalModelInfo.fromMap(Map<String, dynamic> map) => LocalModelInfo(
        name: map['name'] as String? ?? 'unknown',
        type: map['type'] as String? ?? 'unknown',
        classes: map['classes'] as int? ?? 0,
        isReady: map['isReady'] as bool? ?? false,
      );
}

/// Service for on-device object detection using platform-specific ML models
///
/// Uses:
/// - CoreML (YOLO11n) on iOS
/// - TFLite (YOLO11n) on Android
class LocalDetectionService {
  static const _channel = MethodChannel('com.allmythings/local_detector');

  static LocalDetectionService? _instance;

  LocalDetectionService._();

  /// Singleton instance
  static LocalDetectionService get instance {
    _instance ??= LocalDetectionService._();
    return _instance!;
  }

  bool _isInitialized = false;
  bool _isReady = false;

  /// Whether the detector is initialized and ready
  bool get isReady => _isReady;

  /// Initialize the detector
  Future<bool> initialize() async {
    if (_isInitialized) return _isReady;

    try {
      final result = await _channel.invokeMethod<bool>('isReady');
      _isReady = result ?? false;
      _isInitialized = true;
      debugPrint('LocalDetectionService: Initialized, isReady=$_isReady');
      return _isReady;
    } on PlatformException catch (e) {
      debugPrint('LocalDetectionService: Init failed - ${e.message}');
      _isInitialized = true;
      _isReady = false;
      return false;
    }
  }

  /// Get model info
  Future<LocalModelInfo?> getModelInfo() async {
    try {
      final result = await _channel.invokeMethod<Map<Object?, Object?>>('getModelInfo');
      if (result == null) return null;
      return LocalModelInfo.fromMap(
        result.map((k, v) => MapEntry(k.toString(), v)),
      );
    } on PlatformException catch (e) {
      debugPrint('LocalDetectionService: getModelInfo failed - ${e.message}');
      return null;
    }
  }

  /// Detect objects in an image file
  Future<List<LocalDetection>> detectFromFile(
    File imageFile, {
    int? width,
    int? height,
  }) async {
    if (!_isReady) {
      await initialize();
      if (!_isReady) {
        throw StateError('Local detector not ready');
      }
    }

    try {
      final stopwatch = Stopwatch()..start();

      final result = await _channel.invokeMethod<List<Object?>>('detectFromPath', {
        'path': imageFile.path,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
      });

      stopwatch.stop();
      debugPrint(
        'LocalDetectionService: Detection completed in ${stopwatch.elapsedMilliseconds}ms',
      );

      if (result == null) return [];

      return result
          .whereType<Map<Object?, Object?>>()
          .map((m) => LocalDetection.fromMap(
                m.map((k, v) => MapEntry(k.toString(), v)),
              ))
          .toList();
    } on PlatformException catch (e) {
      debugPrint('LocalDetectionService: Detection failed - ${e.message}');
      rethrow;
    }
  }

  /// Detect objects from image bytes
  Future<List<LocalDetection>> detectFromBytes(
    Uint8List imageData, {
    int? width,
    int? height,
  }) async {
    if (!_isReady) {
      await initialize();
      if (!_isReady) {
        throw StateError('Local detector not ready');
      }
    }

    try {
      final stopwatch = Stopwatch()..start();

      final result = await _channel.invokeMethod<List<Object?>>('detectFromData', {
        'data': imageData,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
      });

      stopwatch.stop();
      debugPrint(
        'LocalDetectionService: Detection completed in ${stopwatch.elapsedMilliseconds}ms',
      );

      if (result == null) return [];

      return result
          .whereType<Map<Object?, Object?>>()
          .map((m) => LocalDetection.fromMap(
                m.map((k, v) => MapEntry(k.toString(), v)),
              ))
          .toList();
    } on PlatformException catch (e) {
      debugPrint('LocalDetectionService: Detection failed - ${e.message}');
      rethrow;
    }
  }

  /// Detect objects from image path
  Future<List<LocalDetection>> detectFromPath(
    String imagePath, {
    int? width,
    int? height,
  }) async {
    return detectFromFile(File(imagePath), width: width, height: height);
  }
}
