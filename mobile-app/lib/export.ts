import type { Home, InventoryItem } from '@/types/inventory';
import { labelsForDisplay } from './labels';

/**
 * Inventory export builders (§9 peace of mind — this app's Price Guarantee).
 * Pure string builders; file staging + the share sheet live in
 * `services/export-share.ts`.
 */

export const EXPORT_SCHEMA_VERSION = 1;

/** Full-fidelity JSON: everything needed to reconstruct the inventory. */
export function buildInventoryJson(
  homes: Home[],
  itemsByHome: Record<string, InventoryItem[]>,
  exportedAt: Date = new Date(),
): string {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    app: 'allmythings',
    exportedAt: exportedAt.toISOString(),
    homes: homes.map((home) => ({
      id: home.id,
      name: home.name,
      icon: home.icon,
      createdAt: new Date(home.createdAt).toISOString(),
      items: (itemsByHome[home.id] ?? []).map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        category: item.category,
        location: item.location ?? null,
        tags: item.tags,
        attributes: item.attributes ?? null,
        // Label-first chips: persisted when present, derived otherwise, so
        // every export row carries them. Legacy columns stay for compat.
        labels: labelsForDisplay(item),
        notes: item.notes,
        box: item.box,
        primaryPhotoUri: item.primaryPhotoUri,
        thumbnailUri: item.thumbnailUri ?? null,
        additionalPhotoUris: item.additionalPhotoUris,
        createdAt: new Date(item.createdAt).toISOString(),
        updatedAt: new Date(item.updatedAt).toISOString(),
      })),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

const CSV_HEADER = [
  'home',
  'type',
  'labels',
  'label',
  'description',
  'category',
  'location',
  'tags',
  'notes',
  'created',
  'updated',
] as const;

/** RFC 4180: quote when needed, double embedded quotes. */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Spreadsheet-friendly CSV: one row per item, tags pipe-joined. */
export function buildInventoryCsv(
  homes: Home[],
  itemsByHome: Record<string, InventoryItem[]>,
): string {
  const lines: string[] = [CSV_HEADER.join(',')];
  for (const home of homes) {
    for (const item of itemsByHome[home.id] ?? []) {
      const labels = labelsForDisplay(item);
      lines.push(
        [
          home.name,
          labels.find((l) => l.key === 'type')?.value ?? '',
          labels.map((l) => `${l.key}:${l.value}`).join('|'),
          item.label,
          item.description,
          item.category,
          item.location ?? '',
          item.tags.join('|'),
          item.notes,
          new Date(item.createdAt).toISOString(),
          new Date(item.updatedAt).toISOString(),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
