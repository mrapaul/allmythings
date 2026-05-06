import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { Repo } from './repository';
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
});
