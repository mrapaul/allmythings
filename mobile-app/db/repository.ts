import type { ItemAttributes } from '@/lib/attributes';
import type { ItemLabel } from '@/lib/labels';
import { resolveMerge } from '@/lib/merge';
import { buildFtsMatchQuery } from '@/lib/search-query';
import type { Home, InventoryItem } from '@/types/inventory';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { homes, inventoryItems, itemTags } from './schema';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * item_tags is UNIQUE(item_id, tag). Merged detections and user edits can
 * repeat a tag ("white" from the label and from the model's tags), and one
 * duplicate must never abort a whole bulk save. Case-insensitive, first
 * spelling wins, blanks dropped.
 */
export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export interface AddItemInput {
  label: string;
  description: string;
  category: string;
  tags: string[];
  primaryPhotoUri: string;
  /** Optional pre-rendered crop; persisted verbatim (already in app storage). */
  thumbnailUri?: string | null;
  /** Detected characteristics ({color, material, …}); null when unknown. */
  attributes?: ItemAttributes | null;
  /** Label-first chips; null → render-time derivation. */
  labels?: ItemLabel[] | null;
  /** Free-text whereabouts; null/undefined → not set (UI hides the row). */
  location?: string | null;
  additionalPhotoUris: string[];
  notes: string;
  box: { x: number; y: number; width: number; height: number };
}

// Bridges expo-sqlite and better-sqlite3 drizzle drivers — the concrete shapes
// differ enough that a precise generic doesn't help us here. Each `any` is
// intentional and silenced per-line.
//
// NOTE: `transaction` is intentionally absent — better-sqlite3 transactions
// are synchronous and reject async callbacks, while the expo-sqlite driver is
// async-only. Keeping per-statement atomicity (which SQLite provides natively)
// works for both drivers without needing the bridged tx API.
type DrizzleLike = {
  // biome-ignore lint/suspicious/noExplicitAny: cross-driver bridge
  insert: (...a: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: cross-driver bridge
  select: (...a: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: cross-driver bridge
  update: (...a: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: cross-driver bridge
  delete: (...a: any[]) => any;
  // biome-ignore lint/suspicious/noExplicitAny: cross-driver bridge
  run: (q: any) => any;
  // biome-ignore lint/suspicious/noExplicitAny: cross-driver bridge
  all: (q: any) => any;
};

interface RawItemRow {
  id: string;
  homeId: string;
  label: string;
  description: string;
  category: string;
  primaryPhotoUri: string;
  thumbnailUri: string | null;
  attributes: ItemAttributes | null;
  labels: ItemLabel[] | null;
  location: string | null;
  additionalPhotoUris: string[];
  notes: string;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  createdAt: number;
  updatedAt: number;
}

export class Repo {
  constructor(private db: DrizzleLike) {}

  async addHome(input: { name: string; icon: string }): Promise<Home> {
    const home: Home = {
      id: newId(),
      name: input.name.trim() || 'New Home',
      icon: input.icon || '🏠',
      createdAt: Date.now(),
    };
    await this.db.insert(homes).values(home);
    return home;
  }

  async listHomes(): Promise<Home[]> {
    const rows = await this.db.select().from(homes).orderBy(homes.createdAt);
    return rows as Home[];
  }

  async renameHome(id: string, name: string, icon: string): Promise<void> {
    await this.db.update(homes).set({ name: name.trim(), icon }).where(eq(homes.id, id));
  }

  async deleteHome(id: string): Promise<void> {
    await this.db.delete(homes).where(eq(homes.id, id));
  }

  async addItems(homeId: string, items: AddItemInput[]): Promise<string[]> {
    const ids: string[] = [];
    const now = Date.now();
    for (const it of items) {
      const id = newId();
      ids.push(id);
      await this.db.insert(inventoryItems).values({
        id,
        homeId,
        label: it.label,
        description: it.description,
        category: it.category,
        primaryPhotoUri: it.primaryPhotoUri,
        thumbnailUri: it.thumbnailUri ?? null,
        attributes: it.attributes ?? null,
        labels: it.labels ?? null,
        location: it.location ?? null,
        additionalPhotoUris: it.additionalPhotoUris,
        notes: it.notes,
        boxX: it.box.x,
        boxY: it.box.y,
        boxWidth: it.box.width,
        boxHeight: it.box.height,
        createdAt: now,
        updatedAt: now,
      });
      const tags = uniqueTags(it.tags);
      if (tags.length > 0) {
        await this.db.insert(itemTags).values(tags.map((tag) => ({ itemId: id, tag })));
      }
    }
    return ids;
  }

  async getItemsByHome(homeId: string): Promise<InventoryItem[]> {
    const rows = (await this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.homeId, homeId))
      .orderBy(desc(inventoryItems.createdAt))) as RawItemRow[];
    return Promise.all(rows.map((r) => this.hydrateItem(r)));
  }

  async getItem(id: string): Promise<InventoryItem | null> {
    const rows = (await this.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))) as RawItemRow[];
    const first = rows[0];
    if (!first) return null;
    return this.hydrateItem(first);
  }

  async updateItem(id: string, patch: Partial<InventoryItem>): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const k of [
      'label',
      'description',
      'category',
      'primaryPhotoUri',
      'thumbnailUri',
      'attributes',
      'labels',
      'location',
      'additionalPhotoUris',
      'notes',
    ] as const) {
      if (patch[k] !== undefined) updates[k] = patch[k];
    }
    if (patch.box) {
      updates.boxX = patch.box.x;
      updates.boxY = patch.box.y;
      updates.boxWidth = patch.box.width;
      updates.boxHeight = patch.box.height;
    }
    await this.db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id));
    if (patch.tags) {
      await this.db.delete(itemTags).where(eq(itemTags.itemId, id));
      const tags = uniqueTags(patch.tags);
      if (tags.length > 0) {
        await this.db.insert(itemTags).values(tags.map((tag) => ({ itemId: id, tag })));
      }
    }
  }

  async deleteItem(id: string): Promise<void> {
    await this.db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }

  /**
   * Folds `mergeIds` into `keepId`: union of labels, concatenated distinct
   * descriptions, best photo/thumbnail, then the merged rows are deleted.
   *
   * Ordering is deliberate: the kept row is updated FIRST (one statement →
   * one FTS re-index via the update trigger), then the duplicates are
   * removed. A cross-driver transaction isn't available here (see the
   * DrizzleLike note above), so this order means a mid-way failure leaves
   * the enriched kept item plus an un-deleted duplicate — visible and
   * re-mergeable, never lost data. Unknown ids are ignored, making the
   * operation idempotent.
   */
  async mergeItems(keepId: string, mergeIds: string[]): Promise<void> {
    const kept = await this.getItem(keepId);
    if (!kept) return;
    const targets = mergeIds.filter((id) => id !== keepId);
    const merged: InventoryItem[] = [];
    for (const id of targets) {
      const item = await this.getItem(id);
      if (item && item.homeId === kept.homeId) merged.push(item);
    }
    if (merged.length === 0) return;

    const resolution = resolveMerge(kept, merged);
    await this.updateItem(keepId, {
      labels: resolution.labels,
      description: resolution.description,
      primaryPhotoUri: resolution.primaryPhotoUri,
      thumbnailUri: resolution.thumbnailUri,
      box: resolution.box,
    });
    for (const item of merged) {
      await this.deleteItem(item.id);
    }
  }

  async deleteAllInHome(homeId: string): Promise<void> {
    await this.db.delete(inventoryItems).where(eq(inventoryItems.homeId, homeId));
  }

  async counts(): Promise<Record<string, number>> {
    const rows = (await this.db
      .select({ homeId: inventoryItems.homeId, n: sql<number>`COUNT(*)` })
      .from(inventoryItems)
      .groupBy(inventoryItems.homeId)) as { homeId: string; n: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.homeId] = Number(r.n);
    return out;
  }

  /**
   * The inventory's own vocabulary: most-used labels, grouped
   * case-insensitively, most frequent first (alphabetical breaks ties so the
   * result is deterministic). Cross-home — the vocabulary that guides
   * detection is everything the user owns, not one home's slice. Cheap
   * enough to compute at dispatch time.
   */
  async topLabels(limit: number): Promise<string[]> {
    const rows = (await this.db.all(sql`
      SELECT MIN(${inventoryItems.label}) AS label
      FROM ${inventoryItems}
      WHERE length(trim(${inventoryItems.label})) > 0
      GROUP BY lower(${inventoryItems.label})
      ORDER BY COUNT(*) DESC, lower(MIN(${inventoryItems.label})) ASC
      LIMIT ${limit}
    `)) as { label: string }[];
    return rows.map((r) => r.label);
  }

  /**
   * Duplicate-purchase guard: items whose label plausibly IS the thing being
   * typed — exact-insensitive, a prefix of the query (either direction, so
   * "lamp" surfaces for "lamp shade" and vice versa), or a whole-name FTS
   * word-prefix match. Cross-home on purpose: the pain is re-buying
   * something you already own, wherever it lives.
   *
   * Deliberately NO bare substring match — typing the generic short words
   * owners actually use ("box", "set") must not surface "toolbox"/"closet".
   * Callers skip queries under 3 chars; under-4-char queries additionally
   * only match at word boundaries (so "box" hits "box set" but not "boxing
   * gloves") and skip the FTS word-prefix tier entirely. LIKE patterns
   * escape %/_ so typed or labeled wildcards can't silently widen a match.
   */
  async findSimilarItems(query: string, limit = 5): Promise<InventoryItem[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const lower = q.toLowerCase();
    const escaped = lower.replace(/[\\%_]/g, (c) => `\\${c}`);
    const fts = buildFtsMatchQuery(q);
    // Short generic words only match as whole words ("box" → "box set", not
    // "boxing gloves"); FTS word-prefix would over-match them.
    const short = q.length < 4;
    const tail = short ? ' %' : '%';

    const conditions = [
      sql`lower(${inventoryItems.label}) = ${lower}`,
      sql`lower(${inventoryItems.label}) LIKE ${escaped + tail} ESCAPE '\\'`,
      sql`${lower} LIKE replace(replace(replace(lower(${inventoryItems.label}), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || ${tail} ESCAPE '\\'`,
    ];
    if (fts && !short) {
      conditions.push(
        sql`${inventoryItems.id} IN (SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH ${fts})`,
      );
    }
    const rows = (await this.db
      .select()
      .from(inventoryItems)
      .where(
        and(sql`length(trim(${inventoryItems.label})) > 0`, or(...conditions)),
      )) as RawItemRow[];

    const tierOf = (row: RawItemRow): number => {
      const label = row.label.toLowerCase();
      if (label === lower) return 0;
      if (label.startsWith(lower) || lower.startsWith(label)) return 1;
      return 2;
    };
    const ranked = rows.sort((a, b) => tierOf(a) - tierOf(b) || b.createdAt - a.createdAt);
    return Promise.all(ranked.slice(0, limit).map((r) => this.hydrateItem(r)));
  }

  /**
   * FTS search. `expansions` are optional semantically-related values drawn
   * from this inventory's own vocabulary (services/vocab-match.ts); they only
   * ever widen the match. Presentation-order ranking is applied by useSearch.
   */
  async searchItems(
    homeId: string,
    query: string,
    expansions: string[] = [],
  ): Promise<InventoryItem[]> {
    const match = buildFtsMatchQuery(query, expansions);
    if (!match) return this.getItemsByHome(homeId);
    const ftsRows = (await this.db.all(
      sql`SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH ${match} LIMIT 200`,
    )) as { item_id: string }[];
    const ids = ftsRows.map((r) => r.item_id);
    if (ids.length === 0) return [];
    const rows = (await this.db
      .select()
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.homeId, homeId), sql`${inventoryItems.id} IN ${ids}`),
      )) as RawItemRow[];
    return Promise.all(rows.map((r) => this.hydrateItem(r)));
  }

  private async hydrateItem(row: RawItemRow): Promise<InventoryItem> {
    const tagRows = (await this.db.select().from(itemTags).where(eq(itemTags.itemId, row.id))) as {
      itemId: string;
      tag: string;
    }[];
    const tags = tagRows.map((t) => t.tag);
    return {
      id: row.id,
      homeId: row.homeId,
      label: row.label,
      description: row.description,
      category: row.category,
      primaryPhotoUri: row.primaryPhotoUri,
      thumbnailUri: row.thumbnailUri,
      attributes: row.attributes,
      labels: row.labels,
      location: row.location,
      additionalPhotoUris: row.additionalPhotoUris,
      notes: row.notes,
      tags,
      box: { x: row.boxX, y: row.boxY, width: row.boxWidth, height: row.boxHeight },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
