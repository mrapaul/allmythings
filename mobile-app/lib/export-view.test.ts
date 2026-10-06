import type { InventoryItem } from '@/types/inventory';
import { describe, expect, it } from 'vitest';
import { buildViewCsv, buildViewJson } from './export-view';

function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    homeId: 'h1',
    label: 'sofa',
    description: 'brown leather sofa',
    category: 'Furniture',
    location: null,
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

describe('buildViewCsv', () => {
  it('writes the agreed header including the location column', () => {
    const csv = buildViewCsv([], 'Collection');
    expect(csv.trimEnd().split('\n')).toHaveLength(1);
    expect(csv.trimEnd().split('\n')[0]).toBe(
      'home,label,description,category,location,tags,notes,created,updated',
    );
  });

  it('exports exactly the items passed — the filtered view, in order', () => {
    const view = [
      makeItem({ id: 'i2', label: 'vase', createdAt: 5, location: 'attic box 3' }),
      makeItem({ id: 'i9', label: 'lamp', createdAt: 9 }),
    ];
    const csv = buildViewCsv(view, 'Results · 2', 'My Home');
    const lines = csv.trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      [
        'My Home',
        'vase',
        'brown leather sofa',
        'Furniture',
        'attic box 3',
        'leather|brown',
        '',
        new Date(5).toISOString(),
        new Date(1_700_000_200_000).toISOString(),
      ].join(','),
    );
    expect(lines[2]).toContain('lamp');
  });

  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const csv = buildViewCsv(
      [
        makeItem({
          label: 'vase, ceramic',
          description: 'say "hi"\nsecond line',
          notes: 'a "b"',
        }),
      ],
      'Collection',
      'Home, Sweet',
    );
    // Embedded newlines live inside quotes, so assert against the whole
    // document rather than a per-\n split.
    expect(csv).toContain('"Home, Sweet"');
    expect(csv).toContain('"vase, ceramic"');
    expect(csv).toContain('"say ""hi""\nsecond line"');
    expect(csv).toContain('"a ""b"""');
  });

  it('leaves the home cell empty when no home name is given', () => {
    const csv = buildViewCsv([makeItem()], 'Collection');
    expect(csv.trimEnd().split('\n')[1]?.startsWith(',')).toBe(true);
  });
});

describe('buildViewJson', () => {
  it('carries the view title, home, count, and one entry per visible item', () => {
    const at = new Date('2026-10-06T12:00:00Z');
    const json = buildViewJson(
      [makeItem(), makeItem({ id: 'i2', label: 'lamp' })],
      'Furniture · 2',
      'My Home',
      at,
    );
    const parsed = JSON.parse(json) as {
      schemaVersion: number;
      kind: string;
      title: string;
      home: string;
      exportedAt: string;
      count: number;
      items: Array<Record<string, unknown>>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.kind).toBe('view');
    expect(parsed.title).toBe('Furniture · 2');
    expect(parsed.home).toBe('My Home');
    expect(parsed.exportedAt).toBe(at.toISOString());
    expect(parsed.count).toBe(2);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      id: 'i1',
      homeId: 'h1',
      label: 'sofa',
      description: 'brown leather sofa',
      category: 'Furniture',
      location: null,
      tags: ['leather', 'brown'],
      notes: '',
      createdAt: new Date(1_700_000_100_000).toISOString(),
      updatedAt: new Date(1_700_000_200_000).toISOString(),
    });
    expect(parsed.items[1]?.label).toBe('lamp');
    expect(parsed.items[1]?.location).toBeNull();
  });

  it('omits home when unnamed and handles an empty view', () => {
    const parsed = JSON.parse(buildViewJson([], 'Collection')) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('home');
    expect(parsed.count).toBe(0);
    expect(parsed.items).toEqual([]);
  });
});
