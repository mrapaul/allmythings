/**
 * Viewfinder grid geometry. Pure line-segment math so the overlay component
 * stays a dumb renderer and the layout rules can be unit-tested directly.
 */

export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Rule-of-thirds lines: verticals at 1/3 and 2/3, horizontals at 1/3 and 2/3. */
export function thirdsLines(width: number, height: number): GridLine[] {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  return [
    { x1: w / 3, y1: 0, x2: w / 3, y2: h },
    { x1: (2 * w) / 3, y1: 0, x2: (2 * w) / 3, y2: h },
    { x1: 0, y1: h / 3, x2: w, y2: h / 3 },
    { x1: 0, y1: (2 * h) / 3, x2: w, y2: (2 * h) / 3 },
  ];
}

/** A subtle cross marking the exact center of the frame. */
export function centerCross(width: number, height: number, arm = 10): GridLine[] {
  const cx = width / 2;
  const cy = height / 2;
  const a = Math.max(0, arm);
  return [
    { x1: cx - a, y1: cy, x2: cx + a, y2: cy },
    { x1: cx, y1: cy - a, x2: cx, y2: cy + a },
  ];
}
