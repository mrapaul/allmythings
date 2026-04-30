import 'package:all_my_things/services/image_quality.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  group('ImageQuality.evaluate', () {
    test('flat-grey frame is blurry (laplacian variance ≈ 0)', () {
      final frame = img.Image(width: 64, height: 64);
      img.fill(frame, color: img.ColorRgb8(128, 128, 128));
      final q = ImageQuality().evaluate(frame);
      expect(q.blurry, isTrue);
      expect(q.laplacianVariance, lessThan(1));
    });

    test('high-contrast checkerboard is NOT blurry', () {
      final frame = img.Image(width: 64, height: 64);
      for (var y = 0; y < 64; y++) {
        for (var x = 0; x < 64; x++) {
          final v = ((x ~/ 4) + (y ~/ 4)) % 2 == 0 ? 0 : 255;
          frame.setPixel(x, y, img.ColorRgb8(v, v, v));
        }
      }
      final q = ImageQuality().evaluate(frame);
      expect(q.blurry, isFalse);
    });

    test('mostly-white frame → overexposed', () {
      final frame = img.Image(width: 64, height: 64);
      img.fill(frame, color: img.ColorRgb8(250, 250, 250));
      final q = ImageQuality().evaluate(frame);
      expect(q.exposure, ExposureClass.overexposed);
    });

    test('mostly-black frame → underexposed', () {
      final frame = img.Image(width: 64, height: 64);
      img.fill(frame, color: img.ColorRgb8(5, 5, 5));
      final q = ImageQuality().evaluate(frame);
      expect(q.exposure, ExposureClass.underexposed);
    });

    test('mid-grey frame → exposure okay', () {
      final frame = img.Image(width: 64, height: 64);
      img.fill(frame, color: img.ColorRgb8(120, 120, 120));
      final q = ImageQuality().evaluate(frame);
      expect(q.exposure, ExposureClass.okay);
    });
  });
}
