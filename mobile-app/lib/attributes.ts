/**
 * Item characteristics (color, material, era, …) as first-class data.
 *
 * Two sources, in priority order:
 * 1. `extractAttributes` — the detect stream's `tags` payload when the
 *    server sends a characteristics OBJECT ({color, material, …}). The
 *    legacy shape is a plain string array; both are handled defensively
 *    because the API contract is evolving server-side.
 * 2. `deriveAttributes` — a keyword fallback over label + description for
 *    existing/manual items, computed at render time only (no writes).
 */

export interface ItemAttributes {
  color?: string;
  material?: string;
  style?: string;
  brand?: string;
  era?: string;
}

const ATTRIBUTE_KEYS = ['color', 'material', 'style', 'brand', 'era'] as const;

/** Non-empty persisted attributes win over derivation. */
export function hasAttributes(attrs: ItemAttributes | null | undefined): boolean {
  if (!attrs) return false;
  return Object.values(attrs).some((v) => typeof v === 'string' && v.trim().length > 0);
}

/**
 * Reads the detect response's `tags` field. Object shape → attribute map;
 * legacy string-array shape (or anything else) → empty.
 */
export function extractAttributes(tags: unknown): ItemAttributes {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return {};
  const source = tags as Record<string, unknown>;
  const out: ItemAttributes = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// BOOTSTRAP HEURISTICS FOR LEGACY ITEMS — the one remaining word list.
//
// These keyword sets exist ONLY to backfill characteristics for items saved
// before attributes/labels existed (and for manual adds), by reading words
// the user or model already wrote. They are never consulted for new
// detections (the model sends characteristics) and never used for search
// matching (that path is FTS + server-side semantic ranking over the user's
// own vocabulary — see lib/search-query.ts / services/vocab-match.ts).
//
// Deliberately NOT a taxonomy of home objects: no object/type nouns appear
// here, only generic colour and material adjectives, which are a closed and
// stable set. Nothing needs maintaining as the catalogue grows. This list
// can be deleted outright once legacy rows are re-labelled.
// ---------------------------------------------------------------------------

const COLOR_TERMS = new Set([
  'white',
  'black',
  'gray',
  'grey',
  'gold',
  'silver',
  'brown',
  'beige',
  'cream',
  'navy',
  'blue',
  'green',
  'red',
  'orange',
  'yellow',
  'pink',
  'purple',
  'teal',
]);

/** Variants map to a canonical material term. */
const MATERIAL_TERMS: Record<string, string> = {
  wood: 'wood',
  wooden: 'wood',
  ceramic: 'ceramic',
  leather: 'leather',
  metal: 'metal',
  metallic: 'metal',
  glass: 'glass',
  fabric: 'fabric',
  wicker: 'wicker',
  rattan: 'rattan',
  marble: 'marble',
  brass: 'brass',
  plastic: 'plastic',
  velvet: 'velvet',
  linen: 'linen',
  cotton: 'cotton',
  stone: 'stone',
};

const ERA_TERMS = new Set(['vintage', 'antique', 'mid-century', 'retro']);

/** Variants map to a canonical color ("golden" → "gold"). */
const COLOR_VARIANTS: Record<string, string> = { golden: 'gold', greyish: 'grey' };

/**
 * Bootstrap fallback (see the word-list note above): scans label +
 * description words for colour/material/era adjectives. First match per
 * attribute wins. Render-time only — results are never written back to the
 * database, and never used to match search queries.
 */
export function deriveAttributes(label: string, description: string): ItemAttributes {
  const words = `${label} ${description}`.toLowerCase().split(/[^a-z-]+/);
  const out: ItemAttributes = {};
  for (const word of words) {
    if (!word) continue;
    if (!out.color) {
      const color = COLOR_TERMS.has(word) ? word : COLOR_VARIANTS[word];
      if (color) out.color = color;
    }
    if (!out.material && MATERIAL_TERMS[word]) out.material = MATERIAL_TERMS[word];
    if (!out.era && ERA_TERMS.has(word)) out.era = word;
  }
  return out;
}

/**
 * Presentation attributes for an item: persisted (from detection) when
 * non-empty, else keyword-derived. Returns only non-empty entries.
 */
export function attributesForDisplay(item: {
  label: string;
  description: string;
  attributes?: ItemAttributes | null;
}): ItemAttributes {
  if (hasAttributes(item.attributes)) {
    const persisted = item.attributes as ItemAttributes;
    const out: ItemAttributes = {};
    for (const key of ATTRIBUTE_KEYS) {
      const value = persisted[key];
      if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
    return out;
  }
  return deriveAttributes(item.label, item.description);
}
