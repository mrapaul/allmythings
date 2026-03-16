import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:flutter/material.dart';

class DetectionBox extends StatelessWidget {
  const DetectionBox({
    required this.detection,
    required this.imageSize,
    required this.displaySize,
    super.key,
    this.color = Colors.red,
  });
  final DetectedObject detection;
  final Size imageSize;
  final Size displaySize;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final box = detection.boundingBox;

    // The bounding box coordinates are normalized (0-1), 
    // so we simply multiply by the display size.
    return Positioned(
      left: box.x * displaySize.width,
      top: box.y * displaySize.height,
      width: box.width * displaySize.width,
      height: box.height * displaySize.height,
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(
            color: color,
            width: 2,
          ),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              top: -20,
              left: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                color: color,
                child: Text(
                  '${detection.label} ${(detection.confidence * 100).toStringAsFixed(0)}%',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
