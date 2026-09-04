/**
 * Display-name helpers. Model output arrives as lowercase/snake_case tokens
 * ("office_chair"); these helpers produce polished display strings WITHOUT
 * ever mutating the stored label — the raw label keeps feeding the
 * corrections/training flywheel untouched.
 */

/**
 * Descriptions longer than this read as sentences, not names — fall back to
 * the label so tiles/list rows stay scannable.
 */
export const MAX_DESCRIPTION_NAME_LENGTH = 48;

/** "office_chair" → "Office chair"; existing capitalization is preserved. */
export function humanizeLabel(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Preferred presentation name for an item: the rich server-side description
 * ("white ceramic plant pot") when it is name-sized, else the label.
 * Display-only — callers must never write this back to storage.
 */
export function displayName(item: { label: string; description: string }): string {
  const desc = item.description.trim();
  if (desc && desc.length <= MAX_DESCRIPTION_NAME_LENGTH) return humanizeLabel(desc);
  return humanizeLabel(item.label);
}

/**
 * Distinguishes items that share a display name inside one rendered list by
 * suffixing an ordinal in encounter order: "Plant pot", "Plant pot · 2".
 * Unique names are returned untouched. Computed at render time only.
 */
export function ordinalDisplayNames(
  items: ReadonlyArray<{ id: string; label: string; description: string }>,
): Map<string, string> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = displayName(item).toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const item of items) {
    const name = displayName(item);
    const key = name.toLowerCase();
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    const isDuplicate = (totals.get(key) ?? 0) > 1;
    out.set(item.id, isDuplicate && nth > 1 ? `${name} · ${nth}` : name);
  }
  return out;
}
