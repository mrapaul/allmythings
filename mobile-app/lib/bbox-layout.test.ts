import { describe, expect, it } from 'vitest';
import { bboxZoomLayout, boxToViewRect, computeCoverLayout, isDetectedBox } from './bbox-layout';

describe('computeCoverLayout', () => {
  it('fills the container exactly when aspect ratios match', () => {
    // Arrange + Act
    const layout = computeCoverLayout(320, 320, 1024, 1024);

    // Assert
    expect(layout).toEqual({ renderWidth: 320, renderHeight: 320, offsetX: 0, offsetY: 0 });
  });

  it('overflows horizontally (negative offsetX) for a landscape photo in a square frame', () => {
    // Arrange + Act: 2:1 photo covering a 320px square renders 640x320.
    const layout = computeCoverLayout(320, 320, 2000, 1000);

    // Assert
    expect(layout.renderWidth).toBe(640);
    expect(layout.renderHeight).toBe(320);
    expect(layout.offsetX).toBe(-160);
    expect(layout.offsetY).toBe(0);
  });

  it('overflows vertically (negative offsetY) for a portrait photo in a square frame', () => {
    // Arrange + Act: 1:2 photo covering a 320px square renders 320x640.
    const layout = computeCoverLayout(320, 320, 1000, 2000);

    // Assert
    expect(layout.renderWidth).toBe(320);
    expect(layout.renderHeight).toBe(640);
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBe(-160);
  });

  it('falls back to the container size for degenerate image dimensions', () => {
    // Arrange + Act
    const layout = computeCoverLayout(320, 320, 0, 0);

    // Assert
    expect(layout).toEqual({ renderWidth: 320, renderHeight: 320, offsetX: 0, offsetY: 0 });
  });
});

describe('boxToViewRect', () => {
  it('maps a normalized box onto a same-aspect layout', () => {
    // Arrange
    const layout = computeCoverLayout(320, 320, 1024, 1024);
    const box = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };

    // Act
    const rect = boxToViewRect(box, layout);

    // Assert
    expect(rect).toEqual({ left: 80, top: 160, width: 160, height: 80 });
  });

  it('applies the cover offset for a landscape photo', () => {
    // Arrange: 2:1 photo in a square → renderWidth 640, offsetX -160.
    const layout = computeCoverLayout(320, 320, 2000, 1000);
    const box = { x: 0.5, y: 0, width: 0.25, height: 1 };

    // Act
    const rect = boxToViewRect(box, layout);

    // Assert
    expect(rect.left).toBe(-160 + 0.5 * 640);
    expect(rect.top).toBe(0);
    expect(rect.width).toBe(160);
    expect(rect.height).toBe(320);
  });
});

describe('bboxZoomLayout', () => {
  it('centers a mid-image box in the container', () => {
    // Arrange: 100px square tile, 1000px square photo, 0.2-wide centered box,
    // no padding so the math is exact.
    const box = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };

    // Act
    const layout = bboxZoomLayout(100, 100, 1000, 1000, box, 0);

    // Assert: region (200px) scales to fill the 100px tile → scale 0.5.
    expect(layout.renderWidth).toBeCloseTo(500, 6);
    expect(layout.renderHeight).toBeCloseTo(500, 6);
    // Box center (0.5) lands at the tile center (50px).
    expect(layout.offsetX + 0.5 * layout.renderWidth).toBeCloseTo(50, 6);
    expect(layout.offsetY + 0.5 * layout.renderHeight).toBeCloseTo(50, 6);
  });

  it('expands the region by the context padding', () => {
    // Arrange: padding 0.5 of the box size on each side → region 0.3..0.7.
    const box = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };

    // Act
    const layout = bboxZoomLayout(100, 100, 1000, 1000, box, 0.5);

    // Assert: 400px region → scale 0.25.
    expect(layout.renderWidth).toBeCloseTo(250, 6);
    expect(layout.offsetX).toBeCloseTo(-75, 6);
  });

  it('clamps the offset at image edges so the tile stays covered', () => {
    // Arrange: box in the top-left corner — centering would expose a gap.
    const box = { x: 0, y: 0, width: 0.2, height: 0.2 };

    // Act
    const layout = bboxZoomLayout(100, 100, 1000, 1000, box, 0);

    // Assert: offsets clamp to 0 (never positive) so the image edge aligns
    // with the tile edge instead of leaving blank space.
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBe(0);
  });

  it('always renders at least as large as the container', () => {
    // Arrange: near-full-height box → zoom scale approaches plain cover.
    const box = { x: 0.3, y: 0.05, width: 0.4, height: 0.9 };

    // Act
    const layout = bboxZoomLayout(100, 100, 2000, 1000, box, 0.18);

    // Assert
    expect(layout.renderWidth).toBeGreaterThanOrEqual(100);
    expect(layout.renderHeight).toBeGreaterThanOrEqual(100);
  });

  it('falls back to plain cover fit for a non-detected box', () => {
    // Arrange
    const fullFrame = { x: 0, y: 0, width: 1, height: 1 };

    // Act + Assert
    expect(bboxZoomLayout(100, 100, 2000, 1000, fullFrame)).toEqual(
      computeCoverLayout(100, 100, 2000, 1000),
    );
  });
});

describe('isDetectedBox', () => {
  it('returns true for a typical detection box', () => {
    expect(isDetectedBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBe(true);
  });

  it('returns false for missing or degenerate boxes', () => {
    expect(isDetectedBox(null)).toBe(false);
    expect(isDetectedBox(undefined)).toBe(false);
    expect(isDetectedBox({ x: 0, y: 0, width: 0, height: 0.5 })).toBe(false);
    expect(isDetectedBox({ x: 0, y: 0, width: 0.5, height: 0 })).toBe(false);
  });

  it('returns false for a full-frame box (no localization signal)', () => {
    expect(isDetectedBox({ x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    expect(isDetectedBox({ x: 0, y: 0, width: 0.99, height: 0.999 })).toBe(false);
  });
});
