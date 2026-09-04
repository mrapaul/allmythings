import type { InventoryItem } from '@/types/inventory';
import { describe, expect, it } from 'vitest';
import {
  type MergeSuggestion,
  computeLocalSuggestions,
  isMergeSuggestion,
  mergeSuggestionLists,
  pairKey,
  parseServerSuggestions,
  pruneSuggestions,
} from './suggestions';

function item(patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    homeId: 'h1',
    label: 'armchair',
    description: '',
    category: 'Furniture',
    tags: [],
    primaryPhotoUri: '',
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

const suggestion = (patch: Partial<MergeSuggestion> = {}): MergeSuggestion => ({
  id: pairKey('a', 'b'),
  keepId: 'a',
  mergeId: 'b',
  source: 'local',
  confidence: 'medium',
  createdAt: 1,
  ...patch,
});

describe('pairKey', () => {
  it('is order-independent', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});

describe('computeLocalSuggestions', () => {
  it('pairs items agreeing on type + color, oldest as keeper', () => {
    const result = computeLocalSuggestions(
      [
        item({ id: 'new', createdAt: 20, labels: [{ key: 'type', value: 'chair' }] }),
        item({ id: 'old', createdAt: 10, labels: [{ key: 'type', value: 'chair' }] }),
      ],
      99,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ keepId: 'old', mergeId: 'new', confidence: 'medium' });
  });

  it('does not pair different types or different colors', () => {
    expect(
      computeLocalSuggestions([
        item({ id: 'a', labels: [{ key: 'type', value: 'chair' }] }),
        item({ id: 'b', labels: [{ key: 'type', value: 'lamp' }] }),
        item({
          id: 'c',
          labels: [
            { key: 'type', value: 'chair' },
            { key: 'color', value: 'teal' },
          ],
        }),
      ]),
    ).toEqual([]);
  });

  it('scans the whole inventory, not just one bucket', () => {
    const result = computeLocalSuggestions([
      item({ id: 'c1', createdAt: 1, labels: [{ key: 'type', value: 'chair' }] }),
      item({ id: 'c2', createdAt: 2, labels: [{ key: 'type', value: 'chair' }] }),
      item({ id: 'l1', createdAt: 3, labels: [{ key: 'type', value: 'lamp' }] }),
      item({ id: 'l2', createdAt: 4, labels: [{ key: 'type', value: 'lamp' }] }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('ignores items without a type label', () => {
    expect(
      computeLocalSuggestions([
        item({ id: 'a', label: '', labels: [] }),
        item({ id: 'b', label: '', labels: [] }),
      ]),
    ).toEqual([]);
  });
});

describe('parseServerSuggestions', () => {
  it('accepts both field namings and grades confidence by score', () => {
    const result = parseServerSuggestions(
      [
        { keepId: 'a', mergeId: 'b', score: 0.95 },
        { itemId: 'c', duplicateId: 'd', score: 0.6 },
        { itemId: 'e', duplicateId: 'f' },
      ],
      5,
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ keepId: 'a', mergeId: 'b', confidence: 'high' });
    expect(result[1]?.confidence).toBe('medium');
    expect(result[2]?.confidence).toBe('medium');
  });

  it('is a no-op for absent or malformed payloads (contract may lag)', () => {
    expect(parseServerSuggestions(undefined)).toEqual([]);
    expect(parseServerSuggestions({ nope: true })).toEqual([]);
    expect(
      parseServerSuggestions([null, 'x', {}, { keepId: 'a' }, { keepId: 'a', mergeId: 'a' }]),
    ).toEqual([]);
  });
});

describe('mergeSuggestionLists', () => {
  it('dedupes by pair regardless of direction', () => {
    const result = mergeSuggestionLists(
      [suggestion()],
      [suggestion({ id: pairKey('b', 'a'), keepId: 'b', mergeId: 'a', source: 'server' })],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('local');
  });

  it('never re-adds a dismissed pair and evicts it from storage', () => {
    const dismissed = [pairKey('a', 'b')];
    expect(mergeSuggestionLists([], [suggestion()], dismissed)).toEqual([]);
    expect(mergeSuggestionLists([suggestion()], [], dismissed)).toEqual([]);
  });

  it('appends genuinely new pairs', () => {
    const result = mergeSuggestionLists(
      [suggestion()],
      [suggestion({ id: pairKey('c', 'd'), keepId: 'c', mergeId: 'd' })],
      [],
    );
    expect(result).toHaveLength(2);
  });
});

describe('pruneSuggestions / isMergeSuggestion', () => {
  it('drops pairs whose items are gone', () => {
    expect(pruneSuggestions([suggestion()], ['a'])).toEqual([]);
    expect(pruneSuggestions([suggestion()], ['a', 'b'])).toHaveLength(1);
  });

  it('validates persisted shapes', () => {
    expect(isMergeSuggestion(suggestion())).toBe(true);
    expect(isMergeSuggestion({ id: 'x' })).toBe(false);
  });
});
