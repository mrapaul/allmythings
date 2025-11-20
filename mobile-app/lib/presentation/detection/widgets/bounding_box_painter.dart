import 'package:all_my_things/domain/models/bounding_box.dart';
import 'package:all_my_things/domain/models/detection.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';

/// Custom painter for drawing bounding boxes on detection results
class BoundingBoxPainter extends CustomPainter {
  BoundingBoxPainter({
    required this.detections,
    required this.imageSize,
    required this.selectedIndices,
  });

  final List<Detection> detections;
  final Size imageSize;
  final Set<int> selectedIndices;

  @override
  void paint(Canvas canvas, Size size) {
    // Calculate scale factors
    final scaleX = size.width / imageSize.width;
    final scaleY = size.height / imageSize.height;

    for (var i = 0; i < detections.length; i++) {
      final detection = detections[i];
      final isSelected = selectedIndices.contains(i);

      _drawBoundingBox(
        canvas,
        detection.boundingBox,
        detection.label,
        detection.confidence,
        scaleX,
        scaleY,
        isSelected,
      );
    }
  }

  void _drawBoundingBox(
    Canvas canvas,
    BoundingBox box,
    String label,
    double confidence,
    double scaleX,
    double scaleY,
    bool isSelected,
  ) {
    // Scale the bounding box coordinates
    final left = box.xMin * scaleX;
    final top = box.yMin * scaleY;
    final right = box.xMax * scaleX;
    final bottom = box.yMax * scaleY;

    final rect = Rect.fromLTRB(left, top, right, bottom);

    // Draw box outline
    final boxPaint = Paint()
      ..color = isSelected ? AppTheme.accentGreen : AppTheme.accentBlue
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3.0 : 2.0;

    canvas.drawRect(rect, boxPaint);

    // Draw background for label
    final labelText = '$label ${(confidence * 100).toStringAsFixed(0)}%';
    final textPainter = TextPainter(
      text: TextSpan(
        text: labelText,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    final labelBgRect = Rect.fromLTWH(
      left,
      top - textPainter.height - 8,
      textPainter.width + 16,
      textPainter.height + 8,
    );

    final labelBgPaint = Paint()
      ..color = isSelected ? AppTheme.accentGreen : AppTheme.accentBlue;

    canvas.drawRect(labelBgRect, labelBgPaint);

    // Draw label text
    textPainter.paint(
      canvas,
      Offset(left + 8, top - textPainter.height - 4),
    );

    // Draw selection indicator if selected
    if (isSelected) {
      final checkmarkPaint = Paint()
        ..color = AppTheme.accentGreen
        ..style = PaintingStyle.fill;

      final checkmarkRect = Rect.fromLTWH(
        right - 24,
        top + 4,
        20,
        20,
      );

      canvas.drawCircle(
        Offset(right - 14, top + 14),
        10,
        checkmarkPaint,
      );

      // Draw checkmark icon
      final checkPaint = Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round;

      final checkPath = Path()
        ..moveTo(right - 18, top + 14)
        ..lineTo(right - 14, top + 18)
        ..lineTo(right - 10, top + 10);

      canvas.drawPath(checkPath, checkPaint);
    }
  }

  @override
  bool shouldRepaint(BoundingBoxPainter oldDelegate) {
    return oldDelegate.detections != detections ||
        oldDelegate.selectedIndices != selectedIndices;
  }
}
