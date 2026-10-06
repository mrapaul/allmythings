import type { DetectionRow } from '@/stores/detection-screen.store';
import { describe, expect, it } from 'vitest';
import { buildItemPayload, effectiveTags } from './review-payload';

const row = {
  id: 'r1',
  included: true,
  saved: false,
  item: {
    label: 'navy velvet sofa',
    description: 'three-seat sofa',
    category: 'Furniture',
    tags: ['navy', 'velvet'],
    box: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  },
} as unknown as DetectionRow;

describe('effectiveTags', () => {
  it('prefers the user-edited tags and drops blanks', () => {
    expect(effectiveTags(row, ['blue sofa', '', '  ', 'velvet'])).toEqual(['blue sofa', 'velvet']);
  });

  it('falls back to the model label plus tags', () => {
    expect(effectiveTags(row, undefined)).toEqual(['navy velvet sofa', 'navy', 'velvet']);
  });
});

describe('buildItemPayload', () => {
  it('uses the first tag as the label and keeps the box and photo', () => {
    const p = buildItemPayload(row, ['blue sofa', 'velvet'], 'file:///p.jpg', 'file:///t.jpg');
    expect(p.label).toBe('blue sofa');
    expect(p.tags).toEqual(['blue sofa', 'velvet']);
    expect(p.primaryPhotoUri).toBe('file:///p.jpg');
    expect(p.thumbnailUri).toBe('file:///t.jpg');
    expect(p.box).toEqual(row.item.box);
    expect(p.category).toBe('Furniture');
    expect(p.additionalPhotoUris).toEqual([]);
  });

  it('falls back to the model label when no tags survive', () => {
    expect(buildItemPayload(row, [], 'file:///p.jpg', null).label).toBe('navy velvet sofa');
  });

  it('carries the chosen review location, defaulting to null', () => {
    expect(buildItemPayload(row, ['sofa'], 'file:///p.jpg', null).location).toBeNull();
    expect(
      buildItemPayload(row, ['sofa'], 'file:///p.jpg', null, 'hallway closet — top shelf').location,
    ).toBe('hallway closet — top shelf');
  });
});
