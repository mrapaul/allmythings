import type { Home, InventoryItem } from '@/types/inventory';
import { and, desc, eq, sql } from 'drizzle-orm';
import { homes, inventoryItems, itemTags } from './schema';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export interface AddItemInput {
  label: string;
  description: string;
  category: string;
  tags: string[];
  primaryPhotoUri: string;
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
        additionalPhotoUris: it.additionalPhotoUris,
        notes: it.notes,
        boxX: it.box.x,
        boxY: it.box.y,
        boxWidth: it.box.width,
        boxHeight: it.box.height,
        createdAt: now,
        updatedAt: now,
      });
      if (it.tags.length > 0) {
        await this.db.insert(itemTags).values(it.tags.map((tag) => ({ itemId: id, tag })));
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
      if (patch.tags.length > 0) {
        await this.db.insert(itemTags).values(patch.tags.map((tag) => ({ itemId: id, tag })));
      }
    }
  }

  async deleteItem(id: string): Promise<void> {
    await this.db.delete(inventoryItems).where(eq(inventoryItems.id, id));
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

  async searchItems(homeId: string, query: string): Promise<InventoryItem[]> {
    const q = query.trim();
    if (!q) return this.getItemsByHome(homeId);
    const ftsRows = (await this.db.all(
      sql`SELECT item_id FROM inventory_fts WHERE inventory_fts MATCH ${`${q}*`} LIMIT 200`,
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
      additionalPhotoUris: row.additionalPhotoUris,
      notes: row.notes,
      tags,
      box: { x: row.boxX, y: row.boxY, width: row.boxWidth, height: row.boxHeight },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
