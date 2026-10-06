import type { InventoryItem } from '@/types/inventory';
import { EXPORT_SCHEMA_VERSION, csvEscape } from './export';

/**
 * In-context export builders — export exactly what the home screen is
 * showing after search/category/sort, one tap from the collection itself.
 * Pure string builders; file staging + the share sheet live in
 * `services/export-share.ts`.
 *
 * Deliberately NO `location` column yet: the location work lands on a sibling
 * branch and the two are reconciled there. Columns: home/label/description/
 * category/tags/notes/created/updated.
 */

const VIEW_CSV_HEADER = [
  'home',
  'label',
  'description',
  'category',
  'tags',
  'notes',
  'created',
  'updated',
] as const;

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Spreadsheet-friendly CSV of the visible items, one row per item, tags
 * pipe-joined, RFC-4180 escaping via the whole-inventory builder's helper.
 * Every row carries `homeName` (a view lives in one home); pass the active
 * home's name. `_title` is part of the builder pair's signature but has no
 * place in a pure-data CSV — the caller uses it for the file name.
 */
export function buildViewCsv(
  items: readonly InventoryItem[],
  _title: string,
  homeName = '',
): string {
  const lines: string[] = [VIEW_CSV_HEADER.join(',')];
  for (const item of items) {
    lines.push(
      [
        homeName,
        item.label,
        item.description,
        item.category,
        item.tags.join('|'),
        item.notes,
        iso(item.createdAt),
        iso(item.updatedAt),
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Structured export of the visible items, mirroring buildInventoryJson. */
export function buildViewJson(
  items: readonly InventoryItem[],
  title: string,
  homeName?: string,
  exportedAt: Date = new Date(),
): string {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'allmythings',
    kind: 'view' as const,
    title,
    ...(homeName ? { home: homeName } : {}),
    exportedAt: exportedAt.toISOString(),
    count: items.length,
    items: items.map((item) => ({
      id: item.id,
      homeId: item.homeId,
      label: item.label,
      description: item.description,
      category: item.category,
      tags: item.tags,
      notes: item.notes,
      createdAt: iso(item.createdAt),
      updatedAt: iso(item.updatedAt),
    })),
  };
  return JSON.stringify(payload, null, 2);
}
