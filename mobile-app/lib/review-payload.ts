import type { AddItemInput } from '@/db/repository';
import { extractAttributes } from '@/lib/attributes';
import { buildLabels } from '@/lib/labels';
import type { DetectionRow } from '@/stores/detection-screen.store';

export type ReviewItemPayload = Omit<AddItemInput, 'primaryPhotoUri'> & { primaryPhotoUri: string };

/** Tags the user edited for a row, or the model's own label + tags. */
export function effectiveTags(row: DetectionRow, edited: string[] | undefined): string[] {
  return (edited ?? [row.item.label, ...row.item.tags]).filter((t) => t.trim());
}

/**
 * The inventory record for one accepted review row. The first tag is the
 * label (user words win); the model's raw tags still feed attributes and
 * search labels so a relabel never loses what the model saw. `location`
 * (when the user picked one for this review) lands on every saved row.
 */
export function buildItemPayload(
  row: DetectionRow,
  tags: string[],
  primaryPhotoUri: string,
  thumbnailUri: string | null,
  location?: string | null,
): ReviewItemPayload {
  const label = tags[0] ?? row.item.label;
  const description = row.item.description ?? '';
  const category = row.item.category ?? 'Other';
  return {
    label,
    description,
    category,
    tags,
    primaryPhotoUri,
    thumbnailUri,
    attributes: extractAttributes(row.item.tags),
    labels: buildLabels({ label, description, category, tags: row.item.tags }),
    location: location ?? null,
    additionalPhotoUris: [],
    notes: '',
    box: row.item.box,
  };
}
