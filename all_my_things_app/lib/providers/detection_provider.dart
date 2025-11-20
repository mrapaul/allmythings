import 'dart:io';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/detection.dart';
import '../models/bounding_box.dart';

final imageDetectionsProvider = FutureProvider.family<List<Detection>, File>((ref, imageFile) async {
  // Simulate network delay
  await Future.delayed(const Duration(seconds: 2));

  // Simulate some mock detections
  final random = Random();
  final mockDetections = List.generate(
    random.nextInt(5) + 1,
    (index) => Detection(
      label: 'Object ${index + 1}',
      confidence: random.nextDouble(),
      boundingBox: BoundingBox(
        x: random.nextDouble() * 200,
        y: random.nextDouble() * 200,
        width: random.nextDouble() * 100 + 50,
        height: random.nextDouble() * 100 + 50,
      ),
    ),
  );

  return mockDetections;
});
