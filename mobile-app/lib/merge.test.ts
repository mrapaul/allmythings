import type { InventoryItem } from '@/types/inventory';
import { describe, expect, it } from 'vitest';
import { mergeDescriptions, pickBestPhoto, resolveMerge, unionLabels } from './merge';

function item(patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    homeId: 'h1',
    label: 'armchair',
    description: '',
    category: 'Furniture',
    tags: [],
    primaryPhotoUri: 'file:///a.jpg',
    thumbnailUri: null,
    attributes: null,
    labels: null,
    additionalPhotoUris: [],
    notes: '',
    box: { x: 0, y: 0, width: 0.2, height: 0.2 },
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

describe('unionLabels', () => {
  it('keeps the kept item value for singleton keys', () => {
    const result = unionLabels(
      [{ key: 'type', value: 'armchair' }],
      [[{ key: 'type', value: 'chair' }]],
    );
    expect(result).toEqual([{ key: 'type', value: 'armchair' }]);
  });

  it('accumulates multi-value keys, deduped case-insensitively', () => {
    const result = unionLabels(
      [{ key: 'color', value: 'orange' }],
      [[{ key: 'color', value: 'ORANGE' }], [{ key: 'color', value: 'teal' }]],
    );
    expect(result).toEqual([
      { key: 'color', value: 'orange' },
      { key: 'color', value: 'teal' },
    ]);
  });

  it('merges free labels from both sides and sorts by key order', () => {
    const result = unionLabels(
      [
        { key: 'tag', value: 'heirloom' },
        { key: 'type', value: 'chair' },
      ],
      [[{ key: 'material', value: 'velvet' }]],
    );
    expect(result.map((l) => l.key)).toEqual(['type', 'material', 'tag']);
  });
});

describe('mergeDescriptions', () => {
  it('joins distinct descriptions, kept first', () => {
    expect(mergeDescriptions(['orange armchair', 'velvet chair'])).toBe(
      'orange armchair · velvet chair',
    );
  });

  it('drops blanks and case-insensitive repeats', () => {
    expect(mergeDescriptions(['sofa', '  ', 'SOFA', ''])).toBe('sofa');
    expect(mergeDescriptions(['', ' '])).toBe('');
  });
});

describe('pickBestPhoto', () => {
  it('prefers an item with a thumbnail', () => {
    const withThumb = item({ id: 'b', thumbnailUri: 'file:///t.jpg' });
    expect(
      pickBestPhoto([item({ id: 'a', box: { x: 0, y: 0, width: 1, height: 1 } }), withThumb])?.id,
    ).toBe('b');
  });

  it('falls back to the largest box area when thumbnails tie', () => {
    const big = item({ id: 'big', box: { x: 0, y: 0, width: 0.6, height: 0.6 } });
    expect(pickBestPhoto([item({ id: 'small' }), big])?.id).toBe('big');
  });

  it('returns null for no candidates', () => {
    expect(pickBestPhoto([])).toBeNull();
  });
});

describe('resolveMerge', () => {
  it('produces union labels, joined descriptions, and the best photo', () => {
    const kept = item({
      id: 'keep',
      label: 'armchair',
      description: 'orange armchair',
      labels: [
        { key: 'type', value: 'armchair' },
        { key: 'color', value: 'orange' },
      ],
    });
    const other = item({
      id: 'dupe',
      label: 'chair',
      description: 'velvet chair',
      thumbnailUri: 'file:///dupe-thumb.jpg',
      primaryPhotoUri: 'file:///dupe.jpg',
      labels: [
        { key: 'type', value: 'chair' },
        { key: 'material', value: 'velvet' },
      ],
    });

    const result = resolveMerge(kept, [other]);
    expect(result.labels).toEqual([
      { key: 'type', value: 'armchair' },
      { key: 'color', value: 'orange' },
      { key: 'material', value: 'velvet' },
    ]);
    expect(result.description).toBe('orange armchair · velvet chair');
    // The duplicate carried the only thumbnail — its photo survives.
    expect(result.primaryPhotoUri).toBe('file:///dupe.jpg');
    expect(result.thumbnailUri).toBe('file:///dupe-thumb.jpg');
  });

  it('derives labels for legacy items that have none persisted', () => {
    const kept = item({ id: 'keep', label: 'sofa', description: 'brown leather sofa' });
    const result = resolveMerge(kept, [item({ id: 'd', label: 'couch', description: '' })]);
    expect(result.labels).toContainEqual({ key: 'type', value: 'sofa' });
    expect(result.labels).toContainEqual({ key: 'color', value: 'brown' });
  });
});
