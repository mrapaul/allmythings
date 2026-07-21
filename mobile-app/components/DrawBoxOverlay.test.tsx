import { describe, expect, it } from 'vitest';
import { MIN_DRAW_SIZE_PX, isDrawnRectUsable, viewRectToNormBox } from './DrawBoxOverlay';

describe('viewRectToNormBox', () => {
  it('normalizes and orders corners regardless of drag direction', () => {
    const box = viewRectToNormBox({ x1: 300, y1: 200, x2: 100, y2: 50 }, 400, 400);
    expect(box).toEqual({ x: 0.25, y: 0.125, width: 0.5, height: 0.375 });
  });

  it('clamps to the view bounds', () => {
    const box = viewRectToNormBox({ x1: -40, y1: -10, x2: 500, y2: 900 }, 400, 400);
    expect(box).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('isDrawnRectUsable', () => {
  it('rejects rects smaller than the minimum in either dimension', () => {
    const tiny = { x1: 0, y1: 0, x2: MIN_DRAW_SIZE_PX - 1, y2: 200 };
    expect(isDrawnRectUsable(tiny)).toBe(false);
    const ok = { x1: 0, y1: 0, x2: MIN_DRAW_SIZE_PX, y2: MIN_DRAW_SIZE_PX };
    expect(isDrawnRectUsable(ok)).toBe(true);
  });
});
