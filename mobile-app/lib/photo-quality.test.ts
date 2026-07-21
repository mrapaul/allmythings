import { describe, expect, it } from 'vitest';
import { MIN_BYTES_PER_PIXEL, assessJpeg } from './photo-quality';

describe('assessJpeg', () => {
  it('flags a JPEG whose compression ratio implies a blurry/dark/featureless frame', () => {
    const w = 1280;
    const h = 960;
    const bytes = Math.floor(w * h * MIN_BYTES_PER_PIXEL) - 1;
    expect(assessJpeg(bytes, w, h)).toBe('suspect');
  });

  it('accepts a normally detailed JPEG', () => {
    const w = 1280;
    const h = 960;
    const bytes = Math.ceil(w * h * MIN_BYTES_PER_PIXEL) + 1;
    expect(assessJpeg(bytes, w, h)).toBe('ok');
  });

  it('treats unknown size or dimensions as ok (never block on missing data)', () => {
    expect(assessJpeg(0, 1280, 960)).toBe('ok');
    expect(assessJpeg(50_000, 0, 0)).toBe('ok');
  });
});
