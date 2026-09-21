import { describe, expect, it } from 'vitest';
import { centerCross, thirdsLines } from './grid-geometry';

describe('thirdsLines', () => {
  it('returns two verticals and two horizontals at the third marks', () => {
    const lines = thirdsLines(300, 240);
    expect(lines).toHaveLength(4);
    const verticals = lines.filter((l) => l.x1 === l.x2);
    const horizontals = lines.filter((l) => l.y1 === l.y2);
    expect(verticals.map((l) => l.x1).sort((a, b) => a - b)).toEqual([100, 200]);
    expect(horizontals.map((l) => l.y1).sort((a, b) => a - b)).toEqual([80, 160]);
    // Every line spans the full frame edge to edge.
    for (const l of verticals) {
      expect(l.y1).toBe(0);
      expect(l.y2).toBe(240);
    }
    for (const l of horizontals) {
      expect(l.x1).toBe(0);
      expect(l.x2).toBe(300);
    }
  });

  it('degenerates to zero-length thirds at zero size without NaN', () => {
    const lines = thirdsLines(0, 0);
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      expect(Number.isFinite(l.x1 + l.y1 + l.x2 + l.y2)).toBe(true);
    }
  });
});

describe('centerCross', () => {
  it('centers both arms on the frame middle', () => {
    const [horizontal, vertical] = centerCross(200, 100, 12);
    expect(horizontal).toEqual({ x1: 88, y1: 50, x2: 112, y2: 50 });
    expect(vertical).toEqual({ x1: 100, y1: 38, x2: 100, y2: 62 });
  });

  it('defaults to a 10px arm', () => {
    const [horizontal] = centerCross(100, 100);
    expect(horizontal).toBeDefined();
    expect((horizontal?.x2 ?? 0) - (horizontal?.x1 ?? 0)).toBe(20);
  });
});
