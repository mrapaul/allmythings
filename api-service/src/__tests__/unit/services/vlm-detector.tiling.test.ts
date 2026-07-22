import { describe, it, expect } from 'vitest';
import {
  shouldTile,
  computeTileRects,
  mapTileBoxToFull,
  TILE_GRID,
  TILE_OVERLAP,
  TILE_TRIGGER_MIN_ITEMS,
  TILE_TRIGGER_MISSING,
} from '../../../services/vlm-detector.tiling';
import type { SceneInfo } from '../../../services/vlm-detector.parse';

function scene(over: Partial<SceneInfo> = {}): SceneInfo {
  return { type: 'room', estimatedTotalItems: null, verdict: 'ok', verdictReason: null, ...over };
}

describe('shouldTile', () => {
  it('tiles a room with many detected items', () => {
    expect(shouldTile(scene(), TILE_TRIGGER_MIN_ITEMS)).toBe(true);
    expect(shouldTile(scene(), TILE_TRIGGER_MIN_ITEMS - 1)).toBe(false);
  });

  it('tiles a room when the model estimates many more items than it listed', () => {
    // Keep counts below TILE_TRIGGER_MIN_ITEMS so only the estimate-gap
    // branch is exercised.
    const est = TILE_TRIGGER_MIN_ITEMS - 2;
    expect(shouldTile(scene({ estimatedTotalItems: est }), est - TILE_TRIGGER_MISSING)).toBe(true);
    expect(shouldTile(scene({ estimatedTotalItems: est }), est - TILE_TRIGGER_MISSING + 1)).toBe(
      false,
    );
  });

  it('never tiles non-room scenes', () => {
    for (const type of ['shelf', 'drawer', 'closeup', 'unknown'] as const) {
      expect(shouldTile(scene({ type, estimatedTotalItems: 50 }), 40)).toBe(false);
    }
  });
});

describe('computeTileRects', () => {
  it('produces a 2x2 grid with overlap that covers the full image', () => {
    const rects = computeTileRects(1000, 800);
    expect(rects).toHaveLength(TILE_GRID * TILE_GRID);
    const expectedW = Math.round(1000 * (0.5 + TILE_OVERLAP / 2)); // 575
    const expectedH = Math.round(800 * (0.5 + TILE_OVERLAP / 2)); // 460
    for (const r of rects) {
      expect(r.width).toBe(expectedW);
      expect(r.height).toBe(expectedH);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(1000);
      expect(r.top + r.height).toBeLessThanOrEqual(800);
    }
    // Corners: (0,0) and bottom-right tile must reach the far edge.
    expect(rects[0]).toMatchObject({ left: 0, top: 0 });
    const last = rects[rects.length - 1]!;
    expect(last.left + last.width).toBe(1000);
    expect(last.top + last.height).toBe(800);
  });

  it('uses integer pixel rects on odd dimensions', () => {
    for (const r of computeTileRects(1023, 767)) {
      expect(Number.isInteger(r.left)).toBe(true);
      expect(Number.isInteger(r.top)).toBe(true);
      expect(Number.isInteger(r.width)).toBe(true);
      expect(Number.isInteger(r.height)).toBe(true);
    }
  });
});

describe('mapTileBoxToFull', () => {
  it('maps a tile-normalized box into full-image normalized coordinates', () => {
    const tile = { left: 500, top: 400, width: 500, height: 400 };
    // Box occupying the middle of the tile.
    const mapped = mapTileBoxToFull(
      { x: 0.2, y: 0.25, width: 0.4, height: 0.5 },
      tile,
      1000,
      800,
    );
    expect(mapped.x).toBeCloseTo((500 + 0.2 * 500) / 1000, 6); // 0.6
    expect(mapped.y).toBeCloseTo((400 + 0.25 * 400) / 800, 6); // 0.625
    expect(mapped.width).toBeCloseTo((0.4 * 500) / 1000, 6); // 0.2
    expect(mapped.height).toBeCloseTo((0.5 * 400) / 800, 6); // 0.25
  });

  it('is identity for a tile covering the whole image', () => {
    const tile = { left: 0, top: 0, width: 1000, height: 800 };
    const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(mapTileBoxToFull(box, tile, 1000, 800)).toEqual(box);
  });
});
