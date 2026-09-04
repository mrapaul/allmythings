import { describe, expect, it } from 'vitest';
import {
  addLabel,
  buildLabels,
  headNoun,
  labelSuggestions,
  labelsForDisplay,
  parseLabelInput,
  primaryChips,
  removeLabel,
  sortLabels,
  typeHandle,
} from './labels';

describe('headNoun', () => {
  it('takes the last token of a noun phrase', () => {
    expect(headNoun('gold framed painting')).toBe('painting');
    expect(headNoun('office chair')).toBe('chair');
    expect(headNoun('armchair')).toBe('armchair');
  });

  it('cuts at the first preposition', () => {
    expect(headNoun('set of books')).toBe('set');
    expect(headNoun('bowl with fruit on table')).toBe('bowl');
  });

  it('handles snake_case and empty input', () => {
    expect(headNoun('office_chair')).toBe('chair');
    expect(headNoun('')).toBe('');
  });
});

describe('buildLabels', () => {
  it('builds type + category + characteristics from a detection', () => {
    const labels = buildLabels({
      label: 'framed painting',
      description: 'gold framed painting',
      category: 'Decor',
      tags: { color: 'gold', material: 'wood' },
    });
    expect(labels).toEqual([
      { key: 'type', value: 'painting' },
      { key: 'category', value: 'Decor' },
      { key: 'color', value: 'gold' },
      { key: 'material', value: 'wood' },
    ]);
  });

  it('derives labels for legacy items (attributes fallback from words)', () => {
    const labels = buildLabels({
      label: 'sofa',
      description: 'brown leather sofa',
      category: 'Furniture',
    });
    expect(labels).toContainEqual({ key: 'type', value: 'sofa' });
    expect(labels).toContainEqual({ key: 'color', value: 'brown' });
    expect(labels).toContainEqual({ key: 'material', value: 'leather' });
  });

  it('turns legacy array tags into free labels, excluding the label itself and dupes', () => {
    const labels = buildLabels({
      label: 'lamp',
      description: '',
      category: 'Lighting',
      tags: ['lamp', 'brass', 'tall'],
    });
    expect(labels).toContainEqual({ key: 'tag', value: 'tall' });
    // 'brass' is already captured as material via derivation — not duplicated.
    expect(labels.filter((l) => l.value === 'brass')).toHaveLength(1);
    expect(labels.some((l) => l.key === 'tag' && l.value === 'lamp')).toBe(false);
  });

  it('prefers persisted attributes over derived words', () => {
    const labels = buildLabels({
      label: 'gold vase',
      description: '',
      attributes: { color: 'navy' },
    });
    expect(labels).toContainEqual({ key: 'color', value: 'navy' });
    expect(labels.some((l) => l.value === 'gold' && l.key === 'color')).toBe(false);
  });
});

describe('labelsForDisplay', () => {
  it('prefers persisted labels and sorts them', () => {
    const labels = labelsForDisplay({
      label: 'sofa',
      description: '',
      labels: [
        { key: 'tag', value: 'heirloom' },
        { key: 'type', value: 'armchair' },
      ],
    });
    expect(labels[0]).toEqual({ key: 'type', value: 'armchair' });
    expect(labels[1]).toEqual({ key: 'tag', value: 'heirloom' });
  });

  it('derives when no labels are persisted', () => {
    expect(labelsForDisplay({ label: 'sofa', description: '' })).toContainEqual({
      key: 'type',
      value: 'sofa',
    });
  });
});

describe('primaryChips / typeHandle', () => {
  const set = [
    { key: 'type', value: 'armchair' },
    { key: 'category', value: 'Furniture' },
    { key: 'color', value: 'orange' },
    { key: 'material', value: 'velvet' },
  ];

  it('picks type + color for tiles', () => {
    expect(primaryChips(set)).toEqual([
      { key: 'type', value: 'armchair' },
      { key: 'color', value: 'orange' },
    ]);
  });

  it('tops up with non-category labels when color is missing', () => {
    expect(primaryChips([set[0] as never, set[1] as never, set[3] as never])).toEqual([
      { key: 'type', value: 'armchair' },
      { key: 'material', value: 'velvet' },
    ]);
  });

  it('typeHandle capitalizes the type and falls back to Item', () => {
    expect(typeHandle(set)).toBe('Armchair');
    expect(typeHandle([])).toBe('Item');
  });
});

describe('parseLabelInput', () => {
  it('parses known key:value input', () => {
    expect(parseLabelInput('color: red')).toEqual({ key: 'color', value: 'red' });
    expect(parseLabelInput('Brand:IKEA')).toEqual({ key: 'brand', value: 'IKEA' });
  });

  it('treats plain values and unknown keys as free labels', () => {
    expect(parseLabelInput('heirloom')).toEqual({ key: 'tag', value: 'heirloom' });
    expect(parseLabelInput('weight: 3kg')).toEqual({ key: 'tag', value: 'weight: 3kg' });
  });

  it('returns null for blank input', () => {
    expect(parseLabelInput('   ')).toBeNull();
  });
});

describe('addLabel / removeLabel', () => {
  it('dedupes case-insensitively and appends multi-value keys', () => {
    const base = [{ key: 'color', value: 'red' }];
    expect(addLabel(base, { key: 'color', value: 'RED' })).toEqual(base);
    expect(addLabel(base, { key: 'color', value: 'blue' })).toHaveLength(2);
  });

  it('replaces singleton keys (type, brand, era)', () => {
    const base = [
      { key: 'type', value: 'chair' },
      { key: 'color', value: 'red' },
    ];
    const next = addLabel(base, { key: 'type', value: 'armchair' });
    expect(next.filter((l) => l.key === 'type')).toEqual([{ key: 'type', value: 'armchair' }]);
    expect(next).toHaveLength(2);
  });

  it('removeLabel deletes exactly the matching chip, immutably', () => {
    const base = [
      { key: 'color', value: 'red' },
      { key: 'color', value: 'blue' },
    ];
    const next = removeLabel(base, { key: 'color', value: 'red' });
    expect(next).toEqual([{ key: 'color', value: 'blue' }]);
    expect(base).toHaveLength(2);
  });
});

describe('sortLabels', () => {
  it('orders by semantic key, free tags last', () => {
    const sorted = sortLabels([
      { key: 'tag', value: 'x' },
      { key: 'color', value: 'red' },
      { key: 'type', value: 'chair' },
    ]);
    expect(sorted.map((l) => l.key)).toEqual(['type', 'color', 'tag']);
  });
});

describe('labelSuggestions', () => {
  const inventory = [
    [
      { key: 'color', value: 'gold' },
      { key: 'type', value: 'painting' },
    ],
    [
      { key: 'color', value: 'grey' },
      { key: 'color', value: 'gold' },
    ],
  ];

  it('returns distinct prefix matches across the inventory', () => {
    expect(labelSuggestions(inventory, 'g')).toEqual(['gold', 'grey']);
    expect(labelSuggestions(inventory, 'go')).toEqual(['gold']);
  });

  it('caps results', () => {
    expect(labelSuggestions(inventory, '', 2)).toHaveLength(2);
  });
});
