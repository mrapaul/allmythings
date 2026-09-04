/**
 * Category → glyph. The "icons only" layer: a tile identifies its family with
 * a single small Feather glyph instead of words. Data-driven with a default so
 * arbitrary user categories degrade gracefully — never a missing icon.
 *
 * Matching is case-insensitive and forgiving of close variants ("Light",
 * "Lighting") via a normalized key, but this is a PRESENTATION map only —
 * it never feeds search or storage, so it does not violate the
 * no-hardcoded-vocabulary mandate (deleting an entry only changes a glyph).
 */

export type CategoryIconName =
  | 'archive'
  | 'sun'
  | 'image'
  | 'feather'
  | 'monitor'
  | 'coffee'
  | 'book-open'
  | 'watch'
  | 'tool'
  | 'shopping-bag'
  | 'gift'
  | 'music'
  | 'box';

/** Fallback for categories the map has never heard of. */
export const DEFAULT_CATEGORY_ICON: CategoryIconName = 'box';

const ICON_MAP: Record<string, CategoryIconName> = {
  furniture: 'archive',
  lighting: 'sun',
  light: 'sun',
  lamp: 'sun',
  art: 'image',
  artwork: 'image',
  decor: 'image',
  decoration: 'image',
  plant: 'feather',
  plants: 'feather',
  electronics: 'monitor',
  electronic: 'monitor',
  appliances: 'monitor',
  appliance: 'monitor',
  kitchen: 'coffee',
  kitchenware: 'coffee',
  books: 'book-open',
  book: 'book-open',
  clothing: 'watch',
  clothes: 'watch',
  fashion: 'watch',
  accessories: 'watch',
  tools: 'tool',
  tool: 'tool',
  bags: 'shopping-bag',
  bag: 'shopping-bag',
  toys: 'gift',
  toy: 'gift',
  music: 'music',
  instruments: 'music',
  other: 'box',
};

export function categoryIcon(category: string | null | undefined): CategoryIconName {
  if (!category) return DEFAULT_CATEGORY_ICON;
  const key = category.trim().toLowerCase();
  return ICON_MAP[key] ?? DEFAULT_CATEGORY_ICON;
}
