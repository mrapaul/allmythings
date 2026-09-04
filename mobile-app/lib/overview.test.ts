import type { InventoryItem } from '@/types/inventory';
import { describe, expect, it } from 'vitest';
import { groupByCategory, toggleCollapsed } from './overview';

function item(id: string, category: string): InventoryItem {
  return {
    id,
    homeId: 'h1',
    label: id,
    description: '',
    category,
    tags: [],
    primaryPhotoUri: '',
    thumbnailUri: null,
    attributes: null,
    labels: null,
    additionalPhotoUris: [],
    notes: '',
    box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('groupByCategory', () => {
  it('groups into sections, largest first, alphabetical tiebreak', () => {
    const sections = groupByCategory([
      item('a', 'Lighting'),
      item('b', 'Furniture'),
      item('c', 'Furniture'),
      item('d', 'Books'),
    ]);
    expect(sections.map((s) => s.category)).toEqual(['Furniture', 'Books', 'Lighting']);
    expect(sections[0]?.count).toBe(2);
  });

  it('folds blank categories into Other and preserves item order within a section', () => {
    const sections = groupByCategory([item('a', ''), item('b', '  '), item('c', 'Other')]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.category).toBe('Other');
    expect(sections[0]?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('assigns continuous startIndex across sections (tile testID continuity)', () => {
    const sections = groupByCategory([
      item('a', 'Furniture'),
      item('b', 'Furniture'),
      item('c', 'Books'),
      item('d', 'Lighting'),
    ]);
    expect(sections.map((s) => s.startIndex)).toEqual([0, 2, 3]);
  });

  it('returns no sections for an empty collection', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe('toggleCollapsed', () => {
  it('adds, removes, and never mutates the input', () => {
    const base = new Set<string>();
    const one = toggleCollapsed(base, 'Furniture');
    expect(one.has('Furniture')).toBe(true);
    expect(base.size).toBe(0);
    const back = toggleCollapsed(one, 'Furniture');
    expect(back.has('Furniture')).toBe(false);
    expect(one.has('Furniture')).toBe(true);
  });
});
