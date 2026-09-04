import type { BoundingBox } from '@/types/inventory';

/**
 * Partial-visibility analysis for detected objects — pure, client-side, and
 * retroactive (it reads the box already persisted on every item, so existing
 * rows get a verdict with no migration and no server dependency).
 *
 * Boxes are normalized against the FULL processed frame, so a box touching a
 * frame edge means the camera truncated the object: the pixels continue past
 * the photo. That is the only signal needed here.
 */

export type VisibilityVerdict = 'full' | 'clipped' | 'sliver';

export interface EdgeContact {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
  /** How many of the four edges the box touches. */
  count: number;
}

// --- Calibration -----------------------------------------------------------
// EDGE_MARGIN: detector boxes rarely land exactly on 0.0/1.0, so "touching"
// needs a tolerance. 1.5% of the frame is ~19px on the 1280px-wide processed
// photo — wide enough to catch a truncated edge, tight enough that an object
// merely photographed NEAR the edge still reads as fully visible.
//
// SLIVER_AREA_FRACTION: the judgment the owner asked for. A box touching an
// edge is either (a) a real possession that continues out of frame — a sofa,
// rug, or wardrobe, which occupies a lot of the picture, or (b) a fragment of
// something almost entirely outside the frame, which occupies very little.
// Area separates the two cleanly. 6% is deliberately conservative: at 6% of a
// frame a real object is still recognisably photographed, and being
// conservative matters because a false 'sliver' UNCHECKS a row the user
// wanted. Corner fragments in practice sit far below this.
//
// MULTI_EDGE_SLIVER_AREA: touching two edges means a corner, which is the
// exact artifact case ("partially visible in the corner"). A corner fragment
// gets a more generous size allowance before we accept it as a real object,
// because two-edge contact is much stronger evidence of truncation than one.
// Above this, two-edge contact is a genuinely large subject (a rug spanning
// the bottom corners) and stays 'clipped'.

export const EDGE_MARGIN = 0.015;
export const SLIVER_AREA_FRACTION = 0.06;
export const MULTI_EDGE_SLIVER_AREA = 0.15;

/** Fraction of the frame the box covers (0–1). */
export function boxArea(box: BoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

/** Which frame edges the box touches, within EDGE_MARGIN. */
export function edgeContact(box: BoundingBox, margin: number = EDGE_MARGIN): EdgeContact {
  const left = box.x <= margin;
  const top = box.y <= margin;
  const right = box.x + box.width >= 1 - margin;
  const bottom = box.y + box.height >= 1 - margin;
  return {
    left,
    top,
    right,
    bottom,
    count: Number(left) + Number(top) + Number(right) + Number(bottom),
  };
}

/**
 * Classifies how completely an object sits inside the frame:
 *  - 'full'    — no edge contact; the whole object is photographed.
 *  - 'clipped' — a large object running past an edge; a real possession worth
 *                inventorying, just not fully pictured.
 *  - 'sliver'  — a fragment: too small to be a credible standalone subject,
 *                or a small corner intrusion. Almost always a truncation
 *                artifact rather than something the user owns "here".
 */
export function visibilityVerdict(box: BoundingBox): VisibilityVerdict {
  const contact = edgeContact(box);
  if (contact.count === 0) return 'full';
  const area = boxArea(box);
  if (area < SLIVER_AREA_FRACTION) return 'sliver';
  if (contact.count >= 2 && area < MULTI_EDGE_SLIVER_AREA) return 'sliver';
  return 'clipped';
}

/** Quiet, non-alarming copy for the review row and the item modal. */
export function visibilityNote(verdict: VisibilityVerdict): string | null {
  if (verdict === 'sliver') return 'Only partly in frame';
  if (verdict === 'clipped') return 'Only partly in frame — extends past the edge';
  return null;
}

/** Slivers arrive unchecked; clipped rows stay checked. Both are one tap. */
export function startsExcluded(verdict: VisibilityVerdict): boolean {
  return verdict === 'sliver';
}
