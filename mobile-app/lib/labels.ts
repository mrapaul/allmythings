import {
  type ItemAttributes,
  deriveAttributes,
  extractAttributes,
  hasAttributes,
} from './attributes';
import { humanizeLabel } from './display-name';

/**
 * Label-first item model: an item is a picture, a date, and discrete typed
 * labels. Each label is a {key, value} chip. Known keys carry semantics
 * (type = object head noun, category, color, material, style, era, brand);
 * anything else the user types is a free label under the 'tag' key.
 *
 * Legacy `label`/`description` columns stay untouched in the DB (corrections
 * flywheel + back-compat) — they feed DERIVATION only and are never edited.
 */

export interface ItemLabel {
  key: string;
  value: string;
}

/** Free-form labels the user adds without a key. */
export const FREE_LABEL_KEY = 'tag';

/** Keys where a single value makes sense — adding replaces. */
export const SINGLETON_KEYS = new Set(['type', 'category', 'style', 'era', 'brand']);

const KNOWN_KEYS = new Set(['type', 'category', 'color', 'material', 'style', 'era', 'brand']);

/** Display/grouping order for chips. */
export const LABEL_KEY_ORDER = [
  'type',
  'category',
  'color',
  'material',
  'style',
  'era',
  'brand',
  FREE_LABEL_KEY,
];

const ATTRIBUTE_LABEL_KEYS = ['color', 'material', 'style', 'era', 'brand'] as const;

/** Tokens that end the head-noun phrase ("bowl of fruit" → "bowl"). */
const PREPOSITIONS = new Set(['of', 'with', 'in', 'on', 'for', 'from', 'by', 'at', 'to', 'and']);

/**
 * The object's head noun: last token before any preposition. Mirrors the
 * API's approach ("gold framed painting" → "painting", "set of books" →
 * "set").
 */
export function headNoun(label: string): string {
  const tokens = label
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 0);
  const cut = tokens.findIndex((t) => PREPOSITIONS.has(t));
  const phrase = cut === -1 ? tokens : tokens.slice(0, cut);
  return phrase[phrase.length - 1] ?? '';
}

export interface LabelSource {
  label: string;
  description?: string;
  category?: string | null;
  /** Detect payload `tags`: characteristics object OR legacy string array. */
  tags?: unknown;
  attributes?: ItemAttributes | null;
}

function sameLabel(a: ItemLabel, b: ItemLabel): boolean {
  return a.key === b.key && a.value.toLowerCase() === b.value.toLowerCase();
}

/**
 * Builds the full label set from legacy fields. Used both at save time for
 * new detections and at render time to derive labels for existing items
 * (no destructive writes — derivation is materialized only when the user
 * edits).
 */
export function buildLabels(src: LabelSource): ItemLabel[] {
  const out: ItemLabel[] = [];
  const push = (key: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = { key, value: trimmed };
    if (!out.some((l) => sameLabel(l, next))) out.push(next);
  };

  push('type', headNoun(src.label));
  if (src.category) push('category', src.category);

  // Characteristic precedence: persisted attributes → detect-payload object
  // tags → keyword derivation from label + description.
  const merged: ItemAttributes = {
    ...deriveAttributes(src.label, src.description ?? ''),
    ...extractAttributes(src.tags),
    ...(hasAttributes(src.attributes) ? src.attributes : {}),
  };
  for (const key of ATTRIBUTE_LABEL_KEYS) {
    const value = merged[key];
    if (typeof value === 'string') push(key, value);
  }

  // Legacy array-shape tags become free labels (minus the label itself).
  if (Array.isArray(src.tags)) {
    for (const tag of src.tags) {
      if (typeof tag !== 'string') continue;
      const t = tag.trim();
      if (!t || t.toLowerCase() === src.label.trim().toLowerCase()) continue;
      if (out.some((l) => l.value.toLowerCase() === t.toLowerCase())) continue;
      push(FREE_LABEL_KEY, t);
    }
  }
  return out;
}

/** Persisted labels when present, otherwise derived — for ALL items. */
export function labelsForDisplay(item: LabelSource & { labels?: ItemLabel[] | null }): ItemLabel[] {
  if (item.labels && item.labels.length > 0) return sortLabels(item.labels);
  return buildLabels(item);
}

/** Stable sort by semantic key order (unknown keys last, before free tags). */
export function sortLabels(labels: ItemLabel[]): ItemLabel[] {
  const rank = (key: string) => {
    const i = LABEL_KEY_ORDER.indexOf(key);
    return i === -1 ? LABEL_KEY_ORDER.length - 1.5 : i;
  };
  return [...labels].sort((a, b) => rank(a.key) - rank(b.key));
}

/** Tile chips: type + color when present, topped up to two (never category). */
export function primaryChips(labels: ItemLabel[]): ItemLabel[] {
  const type = labels.find((l) => l.key === 'type');
  const color = labels.find((l) => l.key === 'color');
  const picks: ItemLabel[] = [];
  if (type) picks.push(type);
  if (color) picks.push(color);
  const rest = labels.filter((l) => !picks.includes(l) && l.key !== 'category');
  return [...picks, ...rest].slice(0, 2);
}

/** Compact textual handle: the capitalized type value ("Armchair"). */
export function typeHandle(labels: ItemLabel[]): string {
  const type = labels.find((l) => l.key === 'type');
  return type ? humanizeLabel(type.value) : 'Item';
}

/**
 * Chip-editor input parser: "color: red" → typed chip (known keys only,
 * case-insensitive); anything else → free label with the raw text.
 */
export function parseLabelInput(raw: string): ItemLabel | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
  if (match) {
    const key = (match[1] as string).toLowerCase();
    if (KNOWN_KEYS.has(key)) return { key, value: (match[2] as string).trim() };
  }
  return { key: FREE_LABEL_KEY, value: trimmed };
}

/** Adds a chip: dedupes (case-insensitive); singleton keys replace. */
export function addLabel(labels: ItemLabel[], next: ItemLabel): ItemLabel[] {
  if (labels.some((l) => sameLabel(l, next))) return labels;
  if (SINGLETON_KEYS.has(next.key)) {
    return [...labels.filter((l) => l.key !== next.key), next];
  }
  return [...labels, next];
}

export function removeLabel(labels: ItemLabel[], target: ItemLabel): ItemLabel[] {
  return labels.filter((l) => !sameLabel(l, target));
}

/** Distinct values across the inventory, prefix-filtered, most-frequent-ish first. */
export function labelSuggestions(inventoryLabels: ItemLabel[][], query: string, max = 8): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const labels of inventoryLabels) {
    for (const label of labels) {
      const key = label.value.toLowerCase();
      if (seen.has(key)) continue;
      if (q && !key.startsWith(q)) continue;
      seen.add(key);
      out.push(label.value);
      if (out.length >= max) return out;
    }
  }
  return out;
}
