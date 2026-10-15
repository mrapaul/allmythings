import * as SQLite from 'expo-sqlite';
import { DetectedObject, DynamicFacet } from '../../packages/contracts/src';

export interface StoredInventoryItem extends DetectedObject {
  runId: string;
  thumbnailUri: string;
  sourcePhotoUri: string;
  createdAt: number;
}

export interface EmergentFacetSummary {
  facetId: string;
  glyphName: string;
  count: number;
}

export class ZeroEnumInventoryRepository {
  private db: SQLite.SQLiteDatabase;

  constructor(dbName = 'allmythings_slm.db') {
    this.db = SQLite.openDatabaseSync(dbName);
    this.migrate();
  }

  private migrate(): void {
    this.db.execSync(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL,
        name TEXT NOT NULL,
        confidence REAL NOT NULL,
        thumbnail_uri TEXT NOT NULL,
        source_photo_uri TEXT NOT NULL,
        bbox_json TEXT NOT NULL,
        properties_json TEXT NOT NULL,
        labels_json TEXT NOT NULL,
        labels_text TEXT NOT NULL,
        facet_id TEXT NOT NULL,
        glyph_name TEXT NOT NULL,
        accent_hex TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_facet ON inventory_items(facet_id);
      CREATE INDEX IF NOT EXISTS idx_items_created ON inventory_items(created_at DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS inventory_fts USING fts5(
        id UNINDEXED,
        name,
        facet_id,
        labels_text,
        content='inventory_items',
        content_rowid='rowid',
        tokenize='porter unicode61',
        prefix='2 3 4'
      );

      CREATE TRIGGER IF NOT EXISTS trg_inv_ai AFTER INSERT ON inventory_items BEGIN
        INSERT INTO inventory_fts(rowid, id, name, facet_id, labels_text)
        VALUES (new.rowid, new.id, new.name, new.facet_id, new.labels_text);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_inv_ad AFTER DELETE ON inventory_items BEGIN
        INSERT INTO inventory_fts(inventory_fts, rowid, id, name, facet_id, labels_text)
        VALUES ('delete', old.rowid, old.id, old.name, old.facet_id, old.labels_text);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_inv_au AFTER UPDATE ON inventory_items BEGIN
        INSERT INTO inventory_fts(inventory_fts, rowid, id, name, facet_id, labels_text)
        VALUES ('delete', old.rowid, old.id, old.name, old.facet_id, old.labels_text);
        INSERT INTO inventory_fts(rowid, id, name, facet_id, labels_text)
        VALUES (new.rowid, new.id, new.name, new.facet_id, new.labels_text);
      END;
    `);
  }

  saveVerifiedItem(item: StoredInventoryItem): void {
    const searchableCorpus = [
      item.name,
      item.facet.facetId,
      ...item.labels,
      ...Object.entries(item.properties).flatMap(([k, v]) => [k, v]),
    ]
      .join(' ')
      .toLowerCase();

    this.db.runSync(
      `INSERT INTO inventory_items (
        id, run_id, name, confidence, thumbnail_uri, source_photo_uri,
        bbox_json, properties_json, labels_json, labels_text,
        facet_id, glyph_name, accent_hex, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        properties_json = excluded.properties_json,
        labels_json = excluded.labels_json,
        labels_text = excluded.labels_text,
        facet_id = excluded.facet_id,
        glyph_name = excluded.glyph_name,
        accent_hex = excluded.accent_hex`,
      [
        item.id,
        item.runId,
        item.name,
        item.confidence,
        item.thumbnailUri,
        item.sourcePhotoUri,
        JSON.stringify(item.box2d),
        JSON.stringify(item.properties),
        JSON.stringify(item.labels),
        searchableCorpus,
        item.facet.facetId,
        item.facet.glyphName,
        item.facet.accentHex,
        item.createdAt,
      ]
    );
  }

  getEmergentFacets(limit = 8): EmergentFacetSummary[] {
    return this.db.getAllSync<EmergentFacetSummary>(
      `SELECT 
         facet_id AS facetId,
         glyph_name AS glyphName,
         COUNT(*) AS count
       FROM inventory_items
       GROUP BY facet_id
       ORDER BY count DESC
       LIMIT ?`,
      [limit]
    );
  }

  searchItems(rawQuery: string, activeFacetId: string | null): StoredInventoryItem[] {
    const tokens = rawQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9-_+#]/g, ''))
      .filter(Boolean);

    if (tokens.length === 0 && !activeFacetId) {
      return this.db
        .getAllSync<any>(`SELECT * FROM inventory_items ORDER BY created_at DESC LIMIT 300`)
        .map(this.hydrateRow);
    }

    if (tokens.length === 0 && activeFacetId) {
      return this.db
        .getAllSync<any>(
          `SELECT * FROM inventory_items WHERE facet_id = ? ORDER BY created_at DESC LIMIT 300`,
          [activeFacetId]
        )
        .map(this.hydrateRow);
    }

    const matchQuery = tokens.map((t) => `"${t}"*`).join(' AND ');
    const sql = activeFacetId
      ? `SELECT i.* FROM inventory_fts f
         JOIN inventory_items i ON i.rowid = f.rowid
         WHERE inventory_fts MATCH ? AND i.facet_id = ?
         ORDER BY bm25(inventory_fts) ASC, i.created_at DESC LIMIT 300`
      : `SELECT i.* FROM inventory_fts f
         JOIN inventory_items i ON i.rowid = f.rowid
         WHERE inventory_fts MATCH ?
         ORDER BY bm25(inventory_fts) ASC, i.created_at DESC LIMIT 300`;

    const args = activeFacetId ? [matchQuery, activeFacetId] : [matchQuery];
    return this.db.getAllSync<any>(sql, args).map(this.hydrateRow);
  }

  private hydrateRow(row: any): StoredInventoryItem {
    const facet: DynamicFacet = {
      facetId: row.facet_id,
      glyphName: row.glyph_name,
      accentHex: row.accent_hex,
    };
    return {
      id: row.id,
      runId: row.run_id,
      name: row.name,
      confidence: row.confidence,
      thumbnailUri: row.thumbnail_uri,
      sourcePhotoUri: row.source_photo_uri,
      box2d: JSON.parse(row.bbox_json),
      properties: JSON.parse(row.properties_json),
      labels: JSON.parse(row.labels_json),
      facet,
      createdAt: row.created_at,
    };
  }
}
