import { describe, expect, it } from 'vitest';
import { lensLabel, nextFlashMode, pinchToZoom, toggleZoom, zoomLabel } from './camera-controls';

describe('camera controls', () => {
  it('cycles flash off → auto → on → off', () => {
    expect(nextFlashMode('off')).toBe('auto');
    expect(nextFlashMode('auto')).toBe('on');
    expect(nextFlashMode('on')).toBe('off');
  });

  it('labels lenses by kind and never shows raw ids', () => {
    expect(lensLabel('Back Ultra Wide Camera', 0)).toBe('0.5×');
    expect(lensLabel('Back Telephoto Camera', 2)).toBe('2×');
    expect(lensLabel('Back Camera', 1)).toBe('1×');
    expect(lensLabel('2', 2)).toBe('Lens 3');
  });

  it('quick zoom toggles between 1× and 2×, pinch is clamped', () => {
    expect(zoomLabel(toggleZoom(0))).toBe('2×');
    expect(zoomLabel(toggleZoom(0.5))).toBe('1×');
    expect(pinchToZoom(0, 3)).toBe(1);
    expect(pinchToZoom(0.5, 0.2)).toBeCloseTo(0.1, 6);
    expect(pinchToZoom(0, 0.5)).toBe(0);
  });
});
