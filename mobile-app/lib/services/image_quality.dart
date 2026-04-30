/// §9.1 image_quality — Laplacian blur + RGB histogram exposure pre-check.
///
/// Pure-Dart per-frame quality gate. Operates on decoded [img.Image] frames
/// (bytes-in callers should `decodeImage()` once and re-use). The whole API
/// is sync + side-effect-free so unit tests don't need any platform plugin.
library;

import 'dart:math' as math;

import 'package:image/image.dart' as img;

/// Result of evaluating a single frame.
class FrameQuality {
  const FrameQuality({
    required this.laplacianVariance,
    required this.exposure,
    required this.blurry,
  });

  /// Variance of the Laplacian operator (higher = sharper).
  final double laplacianVariance;

  /// Exposure classification computed from the RGB histogram.
  final ExposureClass exposure;

  /// True when the frame's Laplacian variance is below [ImageQuality.blurThreshold].
  final bool blurry;
}

enum ExposureClass { okay, overexposed, underexposed }

class ImageQuality {
  ImageQuality({
    this.blurThreshold = 100.0,
    this.saturatedFraction = 0.05,
    this.satWhiteThreshold = 240,
    this.satBlackThreshold = 16,
  });

  /// Frames with Laplacian variance below this are flagged blurry.
  final double blurThreshold;

  /// Fraction of pixels that must be at the bright/dark extreme to flag
  /// over/underexposure.
  final double saturatedFraction;

  /// Pixel-channel value at-or-above this counts as bright/saturated.
  final int satWhiteThreshold;

  /// Pixel-channel value at-or-below this counts as black/clipped.
  final int satBlackThreshold;

  /// Evaluate a single frame.
  FrameQuality evaluate(img.Image frame) {
    final grey = img.grayscale(frame);
    final variance = _laplacianVariance(grey);
    final histogram = _classifyExposure(frame);
    return FrameQuality(
      laplacianVariance: variance,
      exposure: histogram,
      blurry: variance < blurThreshold,
    );
  }

  double _laplacianVariance(img.Image grey) {
    final w = grey.width;
    final h = grey.height;
    if (w < 3 || h < 3) {
      return 0.0;
    }
    // 3×3 Laplacian kernel:
    //   0 -1  0
    //  -1  4 -1
    //   0 -1  0
    final values = <double>[];
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        final centre = grey.getPixel(x, y).luminance.toDouble();
        final up = grey.getPixel(x, y - 1).luminance.toDouble();
        final down = grey.getPixel(x, y + 1).luminance.toDouble();
        final left = grey.getPixel(x - 1, y).luminance.toDouble();
        final right = grey.getPixel(x + 1, y).luminance.toDouble();
        final lap = 4 * centre - up - down - left - right;
        values.add(lap);
      }
    }
    if (values.isEmpty) return 0.0;
    final mean = values.reduce((a, b) => a + b) / values.length;
    final sqSum = values.fold<double>(0, (s, v) => s + math.pow(v - mean, 2));
    return sqSum / values.length;
  }

  ExposureClass _classifyExposure(img.Image frame) {
    var bright = 0;
    var dark = 0;
    var total = 0;
    for (var y = 0; y < frame.height; y++) {
      for (var x = 0; x < frame.width; x++) {
        final p = frame.getPixel(x, y);
        final lum = p.luminance;
        if (lum >= satWhiteThreshold) bright++;
        if (lum <= satBlackThreshold) dark++;
        total++;
      }
    }
    if (total == 0) return ExposureClass.okay;
    final brightFrac = bright / total;
    final darkFrac = dark / total;
    if (brightFrac > saturatedFraction && brightFrac > darkFrac) {
      return ExposureClass.overexposed;
    }
    if (darkFrac > saturatedFraction) {
      return ExposureClass.underexposed;
    }
    return ExposureClass.okay;
  }
}
