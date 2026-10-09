import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { type AddItemInput, Repo } from './repository';
import type * as schema from './schema';
import { makeTestDb } from './test-helpers';

describe('Repo', () => {
  let db: BetterSQLite3Database<typeof schema>;
  let repo: Repo;

  beforeEach(() => {
    db = makeTestDb();
    repo = new Repo(db);
  });

  it('addHome + listHomes', async () => {
    const h = await repo.addHome({ name: 'My Home', icon: '🏡' });
    expect(h.id).toBeTruthy();
    const homes = await repo.listHomes();
    expect(homes).toHaveLength(1);
    expect(homes[0]?.name).toBe('My Home');
  });

  it('addItem populates FTS and search returns the item', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    await repo.addItems(h.id, [
      {
        label: 'Sofa',
        description: 'Brown leather couch',
        category: 'Furniture',
        tags: ['leather', 'brown'],
        primaryPhotoUri: 'file:///a.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.5, height: 0.5 },
      },
    ]);
    const hits = await repo.searchItems(h.id, 'leather');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.label).toBe('Sofa');
  });

  it('addItems and updateItem tolerate duplicate tags instead of failing the whole save', async () => {
    // Merged detections can carry the same tag twice ("white" from the label
    // and from the model's tags); item_tags is UNIQUE(item_id, tag), and one
    // bad row must never abort a 30-item bulk save.
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'white ceramic planter',
        description: '',
        category: 'Decor',
        tags: ['white ceramic planter', 'white', 'ceramic', 'white', ' White '],
        primaryPhotoUri: 'file:///a.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.5, height: 0.5 },
      },
    ]);
    const saved = await repo.getItem(id as string);
    expect([...(saved?.tags ?? [])].sort()).toEqual(['ceramic', 'white', 'white ceramic planter']);

    await repo.updateItem(id as string, { tags: ['glossy', 'glossy', 'white'] });
    expect([...((await repo.getItem(id as string))?.tags ?? [])].sort()).toEqual([
      'glossy',
      'white',
    ]);
  });

  it('updateItem updates the FTS row', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'Lamp',
        description: '',
        category: 'Lighting',
        tags: ['brass'],
        primaryPhotoUri: 'file:///b.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.2, height: 0.2 },
      },
    ]);
    if (!id) throw new Error('expected id');
    await repo.updateItem(id, { description: 'Vintage brass floor lamp' });
    const hits = await repo.searchItems(h.id, 'vintage');
    expect(hits[0]?.id).toBe(id);
  });

  it('deleteItem removes the FTS row', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'Chair',
        description: 'Oak chair',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: 'file:///c.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.3, height: 0.3 },
      },
    ]);
    if (!id) throw new Error('expected id');
    await repo.deleteItem(id);
    const hits = await repo.searchItems(h.id, 'oak');
    expect(hits).toHaveLength(0);
  });

  it('persists and returns thumbnailUri, defaulting to null', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [withThumb, withoutThumb] = await repo.addItems(h.id, [
      {
        label: 'Vase',
        description: '',
        category: 'Decor',
        tags: [],
        primaryPhotoUri: 'file:///v.jpg',
        thumbnailUri: 'file:///thumbs/v.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      },
      {
        label: 'Rug',
        description: '',
        category: 'Decor',
        tags: [],
        primaryPhotoUri: 'file:///r.jpg',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.9, height: 0.9 },
      },
    ]);
    if (!withThumb || !withoutThumb) throw new Error('expected ids');
    expect((await repo.getItem(withThumb))?.thumbnailUri).toBe('file:///thumbs/v.jpg');
    expect((await repo.getItem(withoutThumb))?.thumbnailUri).toBeNull();
  });

  it('search matches by prefix as you type', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    await repo.addItems(h.id, [
      {
        label: 'refrigerator',
        description: 'stainless steel refrigerator',
        category: 'Appliances',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.4, height: 0.6 },
      },
    ]);
    const hits = await repo.searchItems(h.id, 'refr');
    expect(hits).toHaveLength(1);
  });

  it('persists attributes and finds items by attribute value via FTS', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'framed painting',
        description: 'a painting in a frame',
        category: 'Decor',
        tags: [],
        primaryPhotoUri: '',
        attributes: { color: 'gold', material: 'wood' },
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0.2, width: 0.248, height: 0.085 },
      },
    ]);
    if (!id) throw new Error('expected id');

    // Round-trip.
    expect((await repo.getItem(id))?.attributes).toEqual({ color: 'gold', material: 'wood' });

    // "gold" is nowhere in label/description/tags — only in attributes.
    const hits = await repo.searchItems(h.id, 'gold');
    expect(hits.map((i) => i.id)).toEqual([id]);

    // Attribute KEYS are not part of the corpus.
    expect(await repo.searchItems(h.id, 'material')).toEqual([]);
  });

  it('persists labels and supports value + key:value FTS search', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'armchair',
        description: '',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: '',
        labels: [
          { key: 'type', value: 'armchair' },
          { key: 'color', value: 'orange' },
          { key: 'tag', value: 'heirloom' },
        ],
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      },
    ]);
    if (!id) throw new Error('expected id');

    expect((await repo.getItem(id))?.labels).toHaveLength(3);
    // Plain value search.
    expect((await repo.searchItems(h.id, 'heirloom')).map((i) => i.id)).toEqual([id]);
    // key:value search — sanitizer turns "color: orange" into color AND orange.
    expect((await repo.searchItems(h.id, 'color: orange')).map((i) => i.id)).toEqual([id]);
    // Editing labels re-indexes.
    await repo.updateItem(id, { labels: [{ key: 'color', value: 'teal' }] });
    expect((await repo.searchItems(h.id, 'teal')).map((i) => i.id)).toEqual([id]);
    expect(await repo.searchItems(h.id, 'heirloom')).toEqual([]);
  });

  it('updateItem re-indexes attributes', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'vase',
        description: '',
        category: 'Decor',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      },
    ]);
    if (!id) throw new Error('expected id');
    await repo.updateItem(id, { attributes: { color: 'navy' } });
    expect((await repo.searchItems(h.id, 'navy')).map((i) => i.id)).toEqual([id]);
  });

  it('persists location (null by default) and returns it from every read path', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [plainId, placedId] = await repo.addItems(h.id, [
      {
        label: 'lamp',
        description: '',
        category: 'Lighting',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.2, height: 0.2 },
      },
      {
        label: 'scarf',
        description: '',
        category: 'Clothing',
        tags: [],
        primaryPhotoUri: '',
        location: 'hallway closet — top shelf',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
      },
    ]);
    if (!plainId || !placedId) throw new Error('expected ids');

    expect((await repo.getItem(plainId))?.location ?? null).toBeNull();
    expect((await repo.getItem(placedId))?.location).toBe('hallway closet — top shelf');
    const fromHome = (await repo.getItemsByHome(h.id)).find((i) => i.id === placedId);
    expect(fromHome?.location).toBe('hallway closet — top shelf');

    await repo.updateItem(placedId, { location: null });
    expect((await repo.getItem(placedId))?.location ?? null).toBeNull();
  });

  it('finds items by location via FTS, including after a move', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [id] = await repo.addItems(h.id, [
      {
        label: 'umbrella',
        description: '',
        category: 'Other',
        tags: [],
        primaryPhotoUri: '',
        location: 'hallway closet — top shelf',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.2, height: 0.2 },
      },
    ]);
    if (!id) throw new Error('expected id');

    // "closet" appears nowhere but the location column.
    expect((await repo.searchItems(h.id, 'closet')).map((i) => i.id)).toEqual([id]);

    await repo.updateItem(id, { location: 'garage — left wall' });
    expect(await repo.searchItems(h.id, 'closet')).toEqual([]);
    expect((await repo.searchItems(h.id, 'garage')).map((i) => i.id)).toEqual([id]);
  });

  it('search survives FTS syntax in the query instead of throwing', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    await expect(repo.searchItems(h.id, 'sofa" OR label:*')).resolves.toEqual([]);
  });

  it('mergeItems unions labels, folds descriptions, and removes duplicates', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [keepId, dupeId] = await repo.addItems(h.id, [
      {
        label: 'armchair',
        description: 'orange armchair',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: 'file:///keep.jpg',
        labels: [
          { key: 'type', value: 'armchair' },
          { key: 'color', value: 'orange' },
        ],
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.2, height: 0.2 },
      },
      {
        label: 'chair',
        description: 'velvet chair',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: 'file:///dupe.jpg',
        thumbnailUri: 'file:///dupe-thumb.jpg',
        labels: [
          { key: 'type', value: 'chair' },
          { key: 'material', value: 'velvet' },
        ],
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 },
      },
    ]);
    if (!keepId || !dupeId) throw new Error('expected ids');

    await repo.mergeItems(keepId, [dupeId]);

    const kept = await repo.getItem(keepId);
    expect(await repo.getItem(dupeId)).toBeNull();
    expect(kept?.labels).toEqual([
      { key: 'type', value: 'armchair' },
      { key: 'color', value: 'orange' },
      { key: 'material', value: 'velvet' },
    ]);
    expect(kept?.description).toBe('orange armchair · velvet chair');
    // Duplicate had the only thumbnail → its photo wins.
    expect(kept?.thumbnailUri).toBe('file:///dupe-thumb.jpg');
    expect(await repo.getItemsByHome(h.id)).toHaveLength(1);
    // FTS re-indexed once: the merged-in label is searchable, the row is gone.
    expect((await repo.searchItems(h.id, 'velvet')).map((i) => i.id)).toEqual([keepId]);
  });

  it('mergeItems is idempotent and ignores unknown/self ids', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    const [keepId, dupeId] = await repo.addItems(h.id, [
      {
        label: 'lamp',
        description: '',
        category: 'Lighting',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.2, height: 0.2 },
      },
      {
        label: 'lamp',
        description: '',
        category: 'Lighting',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      },
    ]);
    if (!keepId || !dupeId) throw new Error('expected ids');

    await repo.mergeItems(keepId, [dupeId]);
    // Re-running with the now-deleted id is a no-op, not an error.
    await expect(repo.mergeItems(keepId, [dupeId])).resolves.toBeUndefined();
    await expect(repo.mergeItems(keepId, [keepId])).resolves.toBeUndefined();
    await expect(repo.mergeItems('missing', [keepId])).resolves.toBeUndefined();
    expect(await repo.getItemsByHome(h.id)).toHaveLength(1);
    expect(await repo.getItem(keepId)).not.toBeNull();
  });

  it('search widens with semantic expansions but never invents matches', async () => {
    const h = await repo.addHome({ name: 'A', icon: '🏠' });
    await repo.addItems(h.id, [
      {
        label: 'sofa',
        description: '',
        category: 'Furniture',
        tags: [],
        primaryPhotoUri: '',
        labels: [{ key: 'type', value: 'sofa' }],
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.4, height: 0.4 },
      },
    ]);
    // No hardcoded vocabulary: "couch" alone finds nothing.
    expect(await repo.searchItems(h.id, 'couch')).toEqual([]);
    // With a server-supplied expansion from this inventory's own values, it does.
    expect((await repo.searchItems(h.id, 'couch', ['sofa'])).map((i) => i.label)).toEqual(['sofa']);
  });

  it('counts groups by homeId', async () => {
    const h1 = await repo.addHome({ name: 'A', icon: '🏠' });
    const h2 = await repo.addHome({ name: 'B', icon: '🏡' });
    await repo.addItems(h1.id, [
      {
        label: 'X',
        description: '',
        category: 'Misc',
        tags: [],
        primaryPhotoUri: '',
        additionalPhotoUris: [],
        notes: '',
        box: { x: 0, y: 0, width: 0.1, height: 0.1 },
      },
    ]);
    expect((await repo.counts())[h1.id]).toBe(1);
    expect((await repo.counts())[h2.id] ?? 0).toBe(0);
  });

  describe('topLabels', () => {
    it('groups case-insensitively and orders by count desc', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [
        item('Lamp'),
        item('lamp'),
        item('LAMP'),
        item('sofa'),
        item('  '),
      ]);
      const labels = await repo.topLabels(10);
      expect(labels[0]?.toLowerCase()).toBe('lamp');
      expect(labels.filter((l) => l.toLowerCase() === 'lamp')).toHaveLength(1);
      expect(labels).toContain('sofa');
      expect(labels).not.toContain('  ');
    });

    it('respects the limit and breaks ties alphabetically', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('b'), item('a'), item('c')]);
      expect(await repo.topLabels(2)).toEqual(['a', 'b']);
      expect(await repo.topLabels(0)).toEqual([]);
    });

    it('spans homes — the vocabulary is everything the user owns', async () => {
      const h1 = await repo.addHome({ name: 'A', icon: '🏠' });
      const h2 = await repo.addHome({ name: 'B', icon: '🏡' });
      await repo.addItems(h1.id, [item('sofa')]);
      await repo.addItems(h2.id, [item('sofa'), item('drill')]);
      const labels = await repo.topLabels(10);
      expect(labels[0]?.toLowerCase()).toBe('sofa'); // 3 copies across homes
      expect(labels).toContain('drill');
    });
  });

  describe('findSimilarItems', () => {
    it('matches exact-insensitive and both prefix directions', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('Lamp'), item('lamp shade'), item('floor lamp')]);

      expect((await repo.findSimilarItems('lamp')).map((i) => i.label.toLowerCase())).toContain(
        'lamp',
      );
      // Label is a prefix of the query.
      expect((await repo.findSimilarItems('lamps')).map((i) => i.label.toLowerCase())).toContain(
        'lamp',
      );
      // Query is a prefix of the label.
      expect((await repo.findSimilarItems('lamp sh')).map((i) => i.label)).toContain('lamp shade');
      // "shade" is a bare substring of "lamp shade"/"floor lamp" — never matches.
      expect((await repo.findSimilarItems('floor lamp')).map((i) => i.label)).toEqual([
        'floor lamp',
      ]);
    });

    it('FTS-matches the whole name word-by-word beyond prefix', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('gold lamp shade')]);
      // Neither LIKE direction matches; the FTS whole-name path does.
      expect((await repo.findSimilarItems('lamp shade')).map((i) => i.label)).toContain(
        'gold lamp shade',
      );
    });

    it('does not substring-match generic short words', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('toolbox'), item('closet organizer'), item('boxing gloves')]);
      expect(await repo.findSimilarItems('box')).toEqual([]);
      expect(await repo.findSimilarItems('set')).toEqual([]);
      // …but "box" still word-matches a label that STARTS with the word.
      await repo.addItems(h.id, [item('box set')]);
      expect((await repo.findSimilarItems('box')).map((i) => i.label)).toEqual(['box set']);
    });

    it('skips lookups under 3 chars', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('lamp')]);
      expect(await repo.findSimilarItems('la')).toEqual([]);
      expect(await repo.findSimilarItems('')).toEqual([]);
      expect(await repo.findSimilarItems('   ')).toEqual([]);
    });

    it('ranks exact before prefix before FTS-only hits', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [
        item('gold lamp shade'), // FTS-only for "lamp" — neither LIKE direction matches
        item('lamp'), // exact
        item('lamp shade'), // prefix
      ]);
      const hits = await repo.findSimilarItems('lamp', 10);
      expect(hits[0]?.label).toBe('lamp');
      expect(hits[1]?.label).toBe('lamp shade');
      expect(hits.map((i) => i.label)).toContain('gold lamp shade');
    });

    it('matches across homes', async () => {
      const h1 = await repo.addHome({ name: 'A', icon: '🏠' });
      const h2 = await repo.addHome({ name: 'B', icon: '🏡' });
      await repo.addItems(h1.id, [item('sofa')]);
      await repo.addItems(h2.id, [item('sofa')]);
      const hits = await repo.findSimilarItems('sofa');
      expect(hits.length).toBe(2);
    });

    it('respects the limit', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('lamp a'), item('lamp b'), item('lamp c')]);
      expect(await repo.findSimilarItems('lamp', 2)).toHaveLength(2);
    });

    it('ignores empty labels even though they prefix-match everything', async () => {
      const h = await repo.addHome({ name: 'A', icon: '🏠' });
      await repo.addItems(h.id, [item('')]);
      expect(await repo.findSimilarItems('lamp')).toEqual([]);
    });
  });
});

function item(label: string): AddItemInput {
  return {
    label,
    description: '',
    category: 'Misc',
    tags: [],
    primaryPhotoUri: '',
    additionalPhotoUris: [],
    notes: '',
    box: { x: 0, y: 0, width: 0.1, height: 0.1 },
  };
}
