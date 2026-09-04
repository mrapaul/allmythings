import { describe, expect, it } from 'vitest';
import {
  EDGE_MARGIN,
  edgeContact,
  startsExcluded,
  visibilityNote,
  visibilityVerdict,
} from './partial-visibility';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('edgeContact', () => {
  it('reports no contact for a centred box', () => {
    expect(edgeContact(box(0.3, 0.3, 0.2, 0.2))).toMatchObject({
      left: false,
      right: false,
      top: false,
      bottom: false,
      count: 0,
    });
  });

  it('detects each edge independently', () => {
    expect(edgeContact(box(0, 0.4, 0.2, 0.2)).left).toBe(true);
    expect(edgeContact(box(0.8, 0.4, 0.2, 0.2)).right).toBe(true);
    expect(edgeContact(box(0.4, 0, 0.2, 0.2)).top).toBe(true);
    expect(edgeContact(box(0.4, 0.8, 0.2, 0.2)).bottom).toBe(true);
  });

  it('counts a corner as two edges', () => {
    expect(edgeContact(box(0, 0, 0.1, 0.1)).count).toBe(2);
  });

  it('treats near-edge boxes inside the margin as touching, outside as clear', () => {
    expect(edgeContact(box(EDGE_MARGIN / 2, 0.4, 0.2, 0.2)).left).toBe(true);
    expect(edgeContact(box(EDGE_MARGIN * 3, 0.4, 0.2, 0.2)).left).toBe(false);
  });
});

describe('visibilityVerdict', () => {
  it('calls a fully-enclosed object full', () => {
    expect(visibilityVerdict(box(0.25, 0.25, 0.3, 0.3))).toBe('full');
    // Close to the edge but not touching is still full.
    expect(visibilityVerdict(box(0.05, 0.05, 0.3, 0.3))).toBe('full');
  });

  it('calls a large object running off one edge clipped (sofa/wardrobe)', () => {
    // 40% × 60% of the frame, hard against the left edge.
    expect(visibilityVerdict(box(0, 0.2, 0.4, 0.6))).toBe('clipped');
  });

  it('calls a large object spanning two edges clipped (rug across a corner)', () => {
    // 55% × 45% — big enough to be a real subject despite two-edge contact.
    expect(visibilityVerdict(box(0, 0.55, 0.55, 0.45))).toBe('clipped');
  });

  it('calls a small edge fragment a sliver', () => {
    // 6% × 30% = 1.8% of frame, hugging the right edge.
    expect(visibilityVerdict(box(0.94, 0.3, 0.06, 0.3))).toBe('sliver');
  });

  it('calls the corner-intrusion case a sliver — the reported complaint', () => {
    // Mid-sized but wedged into a corner: two-edge contact under 15% area.
    expect(visibilityVerdict(box(0, 0, 0.3, 0.35))).toBe('sliver');
  });

  it('does not flag a small object that sits clear of every edge', () => {
    // Tiny AND central: fully visible, just small.
    expect(visibilityVerdict(box(0.45, 0.45, 0.06, 0.06))).toBe('full');
  });
});

describe('review behaviour', () => {
  it('excludes only slivers, so clipped possessions still save by default', () => {
    expect(startsExcluded('sliver')).toBe(true);
    expect(startsExcluded('clipped')).toBe(false);
    expect(startsExcluded('full')).toBe(false);
  });

  it('gives both partial states a quiet note and full state none', () => {
    expect(visibilityNote('sliver')).toBe('Only partly in frame');
    expect(visibilityNote('clipped')).toContain('extends past the edge');
    expect(visibilityNote('full')).toBeNull();
  });
});
