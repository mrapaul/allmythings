import type { InventoryItem } from '@/types/inventory';
import { type ItemLabel, SINGLETON_KEYS, labelsForDisplay, sortLabels } from './labels';

/**
 * Pure resolution of a merge: given the item being KEPT and the ones folded
 * into it, decide the surviving labels, description, and photo. No I/O — the
 * repository applies the result (see Repo.mergeItems).
 */

export interface MergeResolution {
  labels: ItemLabel[];
  description: string;
  primaryPhotoUri: string;
  thumbnailUri: string | null;
  box: { x: number; y: number; width: number; height: number };
}

function boxArea(item: InventoryItem): number {
  return Math.max(0, item.box.width) * Math.max(0, item.box.height);
}

/**
 * Union of label sets. The kept item's labels come first, so for singleton
 * keys (type/category/style/era/brand) its value wins and the others' are
 * dropped; multi-value keys (color/material/free tags) accumulate, deduped
 * case-insensitively.
 */
export function unionLabels(keptLabels: ItemLabel[], otherLabelSets: ItemLabel[][]): ItemLabel[] {
  const out: ItemLabel[] = [];
  const seenSingletons = new Set<string>();

  const push = (label: ItemLabel) => {
    const value = label.value.trim();
    if (!value) return;
    if (SINGLETON_KEYS.has(label.key)) {
      if (seenSingletons.has(label.key)) return;
      seenSingletons.add(label.key);
      out.push({ key: label.key, value });
      return;
    }
    const duplicate = out.some(
      (l) => l.key === label.key && l.value.toLowerCase() === value.toLowerCase(),
    );
    if (!duplicate) out.push({ key: label.key, value });
  };

  for (const label of keptLabels) push(label);
  for (const set of otherLabelSets) {
    for (const label of set) push(label);
  }
  return sortLabels(out);
}

/** Distinct non-empty descriptions, kept item's first, joined into one. */
export function mergeDescriptions(descriptions: string[]): string {
  const out: string[] = [];
  for (const raw of descriptions) {
    const text = raw.trim();
    if (!text) continue;
    if (out.some((d) => d.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
  }
  return out.join(' · ');
}

/**
 * The photo to keep: prefer an item that has a pre-rendered thumbnail, then
 * the largest detected box area (the most confidently localized crop).
 */
export function pickBestPhoto(candidates: InventoryItem[]): InventoryItem | null {
  let best: InventoryItem | null = null;
  for (const candidate of candidates) {
    if (!best) {
      best = candidate;
      continue;
    }
    const hasThumb = Boolean(candidate.thumbnailUri);
    const bestHasThumb = Boolean(best.thumbnailUri);
    if (hasThumb !== bestHasThumb) {
      if (hasThumb) best = candidate;
      continue;
    }
    if (boxArea(candidate) > boxArea(best)) best = candidate;
  }
  return best;
}

export function resolveMerge(kept: InventoryItem, merged: InventoryItem[]): MergeResolution {
  const photo = pickBestPhoto([kept, ...merged]) ?? kept;
  return {
    labels: unionLabels(
      labelsForDisplay(kept),
      merged.map((m) => labelsForDisplay(m)),
    ),
    description: mergeDescriptions([kept.description, ...merged.map((m) => m.description)]),
    primaryPhotoUri: photo.primaryPhotoUri,
    thumbnailUri: photo.thumbnailUri ?? null,
    box: photo.box,
  };
}
