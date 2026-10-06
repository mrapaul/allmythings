import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { type FtsSqlite, ensureFtsSchema, ftsNeedsRebuild } from './triggers';

function adapter(raw: InstanceType<typeof Database>): FtsSqlite {
  return {
    execSync: (sql) => raw.exec(sql),
    getAllSync: (sql) => raw.prepare(sql).all(),
  };
}

/** Minimal source tables the FTS triggers/repopulate read from. */
function createSourceTables(raw: InstanceType<typeof Database>): void {
  raw.exec(`CREATE TABLE inventory_items (
    id TEXT PRIMARY KEY, home_id TEXT, label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
    attributes TEXT, labels TEXT, location TEXT
  );`);
  raw.exec('CREATE TABLE item_tags (item_id TEXT NOT NULL, tag TEXT NOT NULL);');
}

const OLD_FTS = `CREATE VIRTUAL TABLE inventory_fts USING fts5(
  item_id UNINDEXED, label, description, category, tags,
  tokenize = 'porter unicode61');`;

describe('ftsNeedsRebuild', () => {
  it('is false for fresh installs and current shapes', () => {
    expect(ftsNeedsRebuild([])).toBe(false);
    expect(
      ftsNeedsRebuild([
        'item_id',
        'label',
        'description',
        'category',
        'tags',
        'attributes',
        'labels',
        'location',
      ]),
    ).toBe(false);
  });

  it('is true for any earlier shape (pre-attributes, pre-labels, or pre-location)', () => {
    expect(ftsNeedsRebuild(['item_id', 'label', 'description', 'category', 'tags'])).toBe(true);
    expect(
      ftsNeedsRebuild(['item_id', 'label', 'description', 'category', 'tags', 'attributes']),
    ).toBe(true);
    expect(
      ftsNeedsRebuild([
        'item_id',
        'label',
        'description',
        'category',
        'tags',
        'attributes',
        'labels',
      ]),
    ).toBe(true);
  });
});

describe('ensureFtsSchema', () => {
  it('creates the current shape on a fresh database', () => {
    const raw = new Database(':memory:');
    createSourceTables(raw);
    ensureFtsSchema(adapter(raw));
    const cols = raw
      .prepare("SELECT name FROM pragma_table_info('inventory_fts')")
      .all()
      .map((c) => (c as { name: string }).name);
    expect(cols).toContain('attributes');
    expect(cols).toContain('labels');
    expect(cols).toContain('location');
  });

  it('indexes location text so a whereabouts search finds the item', () => {
    const raw = new Database(':memory:');
    createSourceTables(raw);
    ensureFtsSchema(adapter(raw));
    raw
      .prepare(
        `INSERT INTO inventory_items (id, home_id, label, description, category, location)
         VALUES ('i-loc', 'h1', 'umbrella', '', 'Other', 'hallway closet — top shelf')`,
      )
      .run();
    // "closet" appears nowhere but the location column.
    const hits = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'closet*'")
      .all();
    expect(hits.map((h) => (h as { item_id: string }).item_id)).toEqual(['i-loc']);

    // Updating the location re-indexes via the update trigger.
    raw
      .prepare("UPDATE inventory_items SET location = 'garage — left wall' WHERE id = 'i-loc'")
      .run();
    const afterMove = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'garage*'")
      .all();
    expect(afterMove.map((h) => (h as { item_id: string }).item_id)).toEqual(['i-loc']);
    const stale = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'closet*'")
      .all();
    expect(stale).toHaveLength(0);
  });

  it('indexes label keys AND values so key:value searches work', () => {
    const raw = new Database(':memory:');
    createSourceTables(raw);
    ensureFtsSchema(adapter(raw));
    raw
      .prepare(
        `INSERT INTO inventory_items (id, home_id, label, description, category, labels)
         VALUES ('i2', 'h1', 'armchair', '', 'Furniture', ?)`,
      )
      .run(
        JSON.stringify([
          { key: 'type', value: 'armchair' },
          { key: 'color', value: 'orange' },
        ]),
      );
    const byValue = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'orange*'")
      .all();
    expect(byValue).toHaveLength(1);
    // "color: orange" sanitizes to color AND orange — both tokens present.
    const byKeyValue = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'color* AND orange*'")
      .all();
    expect(byKeyValue).toHaveLength(1);
  });

  it('rebuilds a stale table and repopulates, making attributes searchable', () => {
    const raw = new Database(':memory:');
    createSourceTables(raw);
    // Existing install: old FTS shape, one item whose title never says "gold".
    raw.exec(OLD_FTS);
    raw
      .prepare(
        `INSERT INTO inventory_items (id, home_id, label, description, category, attributes, location)
         VALUES ('i1', 'h1', 'framed painting', 'a painting in a frame', 'Decor', ?, ?)`,
      )
      .run(JSON.stringify({ color: 'gold', material: 'wood' }), 'attic — blue bin');

    ensureFtsSchema(adapter(raw));

    const hits = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'gold*'")
      .all() as { item_id: string }[];
    expect(hits.map((h) => h.item_id)).toEqual(['i1']);
    // The attribute KEY is not in the corpus — only values are indexed.
    const keyHits = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'color*'")
      .all();
    expect(keyHits).toHaveLength(0);
    // Repopulated rows carry the location too — "attic" is nowhere else.
    const locHits = raw
      .prepare("SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH 'attic*'")
      .all() as { item_id: string }[];
    expect(locHits.map((h) => h.item_id)).toEqual(['i1']);
  });

  it('is idempotent on the current shape', () => {
    const raw = new Database(':memory:');
    createSourceTables(raw);
    ensureFtsSchema(adapter(raw));
    expect(() => ensureFtsSchema(adapter(raw))).not.toThrow();
  });
});
