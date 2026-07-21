import type { NormBox, SceneInfo } from './vlm-detector.parse';

/**
 * Adaptive tiling for wide scenes.
 *
 * A single full-frame pass saturates on busy room photos: the model lists the
 * big furniture and runs out of attention for small decor. When pass 1 says
 * the scene is a wide room and dense, we split the image into an overlapping
 * grid, run a detection pass per tile, and merge the results. Pure math lives
 * here; the detector does the I/O.
 */

export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Grid is TILE_GRID x TILE_GRID tiles. */
export const TILE_GRID = 2;
/** Overlap between adjacent tiles, as a fraction of the full dimension. */
export const TILE_OVERLAP = 0.15;
/** Tile when pass 1 already found at least this many items in a room scene. */
export const TILE_TRIGGER_MIN_ITEMS = 12;
/** Tile when the model estimates at least this many items beyond what it listed. */
export const TILE_TRIGGER_MISSING = 4;

/**
 * Model-output-driven tiling decision: only wide room scenes, and only when
 * density (items found, or the model's own estimate of what it could not list)
 * suggests a single pass is saturated.
 */
export function shouldTile(scene: SceneInfo, pass1Count: number): boolean {
  if (scene.type !== 'room') return false;
  if (pass1Count >= TILE_TRIGGER_MIN_ITEMS) return true;
  const estimated = scene.estimatedTotalItems;
  return estimated !== null && estimated - pass1Count >= TILE_TRIGGER_MISSING;
}

/** Integer-pixel 2x2 tile rects with TILE_OVERLAP overlap, covering the image. */
export function computeTileRects(w: number, h: number): TileRect[] {
  const tileW = Math.round(w * (1 / TILE_GRID + TILE_OVERLAP / 2));
  const tileH = Math.round(h * (1 / TILE_GRID + TILE_OVERLAP / 2));
  const rects: TileRect[] = [];
  for (let row = 0; row < TILE_GRID; row++) {
    for (let col = 0; col < TILE_GRID; col++) {
      const left = col === TILE_GRID - 1 ? w - tileW : Math.round((col * (w - tileW)) / (TILE_GRID - 1));
      const top = row === TILE_GRID - 1 ? h - tileH : Math.round((row * (h - tileH)) / (TILE_GRID - 1));
      rects.push({ left: Math.max(0, left), top: Math.max(0, top), width: tileW, height: tileH });
    }
  }
  return rects;
}

/** Map a box normalized within a tile into full-image normalized coordinates. */
export function mapTileBoxToFull(
  box: NormBox,
  tile: TileRect,
  fullW: number,
  fullH: number,
): NormBox {
  return {
    x: (tile.left + box.x * tile.width) / fullW,
    y: (tile.top + box.y * tile.height) / fullH,
    width: (box.width * tile.width) / fullW,
    height: (box.height * tile.height) / fullH,
  };
}
