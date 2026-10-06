import type { Home, InventoryItem } from '@/types/inventory';
import { describe, expect, it } from 'vitest';
import { buildInventoryCsv, buildInventoryJson, csvEscape } from './export';

const home: Home = { id: 'h1', name: 'My Home', icon: '🏡', createdAt: 1_700_000_000_000 };

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    homeId: 'h1',
    label: 'sofa',
    description: 'brown leather sofa',
    category: 'Furniture',
    tags: ['leather', 'brown'],
    primaryPhotoUri: 'file:///a.jpg',
    thumbnailUri: null,
    additionalPhotoUris: [],
    notes: '',
    box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    createdAt: 1_700_000_100_000,
    updatedAt: 1_700_000_200_000,
    ...overrides,
  };
}

describe('buildInventoryJson', () => {
  it('exports full fidelity: labels, descriptions, categories, boxes, dates', () => {
    const json = buildInventoryJson([home], { h1: [makeItem()] });
    const parsed = JSON.parse(json) as {
      schemaVersion: number;
      homes: Array<{ name: string; items: Array<Record<string, unknown>> }>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.homes[0]?.name).toBe('My Home');
    const item = parsed.homes[0]?.items[0];
    expect(item).toMatchObject({
      label: 'sofa',
      description: 'brown leather sofa',
      category: 'Furniture',
      tags: ['leather', 'brown'],
      box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    expect(item?.createdAt).toBe(new Date(1_700_000_100_000).toISOString());
    // Label-first: every exported item carries chips (derived when absent).
    expect(item?.labels).toContainEqual({ key: 'type', value: 'sofa' });
  });

  it('carries the location, null when unset', () => {
    const json = buildInventoryJson([home], {
      h1: [makeItem({ location: 'hallway closet — top shelf' }), makeItem({ id: 'i2' })],
    });
    const items = (
      JSON.parse(json) as { homes: Array<{ items: Array<{ location: string | null }> }> }
    ).homes[0]?.items;
    expect(items?.[0]?.location).toBe('hallway closet — top shelf');
    expect(items?.[1]?.location).toBeNull();
  });
});

describe('csvEscape', () => {
  it('quotes and doubles as RFC 4180 requires', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('has, comma')).toBe('"has, comma"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('buildInventoryCsv', () => {
  it('produces a header plus one row per item with escaping applied', () => {
    const csv = buildInventoryCsv([home], {
      h1: [makeItem(), makeItem({ id: 'i2', label: 'vase, ceramic', description: '' })],
    });
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'home,type,labels,label,description,category,location,tags,notes,created,updated',
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"vase, ceramic"');
    expect(lines[1]).toContain('leather|brown');
    // Label-first columns: derived type + serialized chips.
    expect(lines[1]).toContain('sofa');
    expect(lines[1]).toContain('type:sofa');
    expect(lines[1]).toContain('color:brown');
  });

  it('writes the location column after category, empty when unset', () => {
    const csv = buildInventoryCsv([home], {
      h1: [
        makeItem({ location: 'hallway closet — top shelf' }),
        makeItem({ id: 'i2', label: 'rug' }),
      ],
    });
    const lines = csv.trimEnd().split('\n');
    const placed = lines[1]?.split(',');
    // Fixed column order: home,type,labels,label,description,category,location,…
    expect(placed?.[5]).toBe('Furniture');
    expect(placed?.[6]).toBe('hallway closet — top shelf');
    const unset = lines[2]?.split(',');
    expect(unset?.[6]).toBe('');
  });

  it('handles empty inventories', () => {
    const csv = buildInventoryCsv([home], {});
    expect(csv.trimEnd().split('\n')).toHaveLength(1);
  });
});
