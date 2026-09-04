import { describe, expect, it } from 'vitest';
import { thumbCropRect, thumbResizeWidth } from './thumb-crop';

describe('thumbCropRect', () => {
  it('pads the box by 15% and maps to pixel coordinates', () => {
    const rect = thumbCropRect({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, 1000, 1000);
    expect(rect).toEqual({ originX: 370, originY: 370, width: 260, height: 260 });
  });

  it('clamps the padded rect to the image bounds at edges', () => {
    const rect = thumbCropRect({ x: 0, y: 0, width: 0.2, height: 0.2 }, 1000, 500);
    expect(rect).not.toBeNull();
    expect(rect?.originX).toBe(0);
    expect(rect?.originY).toBe(0);
    expect((rect?.originX ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(1000);
    expect((rect?.originY ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(500);
  });

  it('returns null for full-frame boxes (no localization signal)', () => {
    expect(thumbCropRect({ x: 0, y: 0, width: 1, height: 1 }, 1000, 1000)).toBeNull();
  });

  it('returns null for degenerate inputs', () => {
    expect(thumbCropRect({ x: 0.5, y: 0.5, width: 0.001, height: 0.001 }, 100, 100)).toBeNull();
    expect(thumbCropRect({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, 0, 0)).toBeNull();
  });
});

describe('thumbResizeWidth', () => {
  it('caps at the target and never upscales small crops', () => {
    expect(thumbResizeWidth(1200)).toBe(600);
    expect(thumbResizeWidth(300)).toBe(300);
  });
});
