import 'package:all_my_things/domain/models/detected_object.dart';
import 'package:flutter/material.dart';

class DetectionBox extends StatelessWidget {
  const DetectionBox({
    required this.detection,
    required this.imageSize,
    super.key,
    this.color = Colors.red,
  });
  final DetectedObject detection;
  final Size imageSize;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final box = detection.boundingBox;

    return LayoutBuilder(
      builder: (context, constraints) {
        final scaleX = constraints.maxWidth / imageSize.width;
        final scaleY = constraints.maxHeight / imageSize.height;

        return Positioned(
          left: box.x * scaleX,
          top: box.y * scaleY,
          width: box.width * scaleX,
          height: box.height * scaleY,
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(
                color: color,
                width: 2,
              ),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: 0,
                  left: 0,
                  child: Container(
                    padding: const EdgeInsets.all(2),
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
      },
    );
  }
}
