import { displayName } from './display-name';

/**
 * Query-side search logic. There is NO hardcoded vocabulary here: matching is
 * (i) FTS5 prefix/token search over the item's own indexed text — labels,
 * category, description, attributes — which works fully offline, plus
 * (ii) optional semantic expansion terms supplied by the caller (see
 * services/vocab-match.ts, which ranks the inventory's OWN distinct label
 * values against the query server-side). Expansion terms are always drawn
 * from the user's real vocabulary, never from a maintained word list.
 */

export const MAX_RECENT_SEARCHES = 8;

/** Lowercase and strip everything FTS could interpret as syntax. */
export function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeQuery(raw: string): string[] {
  const normalized = normalizeTerm(raw);
  return normalized ? normalized.split(' ') : [];
}

function toPrefixTerm(term: string): string {
  return term.includes(' ') ? `"${term}"*` : `${term}*`;
}

/**
 * Builds a sanitized FTS5 MATCH expression.
 *
 * The base clause AND-joins each query token as a prefix term. Any
 * `expansions` (semantically related values that already exist in this
 * inventory) are OR-ed alongside the base clause, so an expansion can only
 * ever widen the result set — never narrow or break it. Returns null for
 * queries with no indexable characters.
 */
export function buildFtsMatchQuery(raw: string, expansions: string[] = []): string | null {
  const tokens = tokenizeQuery(raw);
  if (tokens.length === 0) return null;

  const base = tokens.map(toPrefixTerm).join(' AND ');
  const phrase = tokens.join(' ');

  const extras: string[] = [];
  for (const expansion of expansions) {
    const normalized = normalizeTerm(expansion);
    if (!normalized || normalized === phrase) continue;
    const term = toPrefixTerm(normalized);
    if (!extras.includes(term)) extras.push(term);
  }
  if (extras.length === 0) return base;

  const baseClause = tokens.length > 1 ? `(${base})` : base;
  return [baseClause, ...extras].join(' OR ');
}

/**
 * Ranks FTS hits for presentation: name/label prefix matches first, then
 * word-prefix matches, then the remaining (semantically expanded) hits. The
 * sort is stable, so the caller's original order breaks ties.
 */
export function rankSearchResults<T extends { label: string; description: string }>(
  items: T[],
  rawQuery: string,
): T[] {
  const q = normalizeTerm(rawQuery);
  if (!q) return items;
  const score = (item: T): number => {
    const name = normalizeTerm(displayName(item));
    const label = normalizeTerm(item.label);
    if (name.startsWith(q) || label.startsWith(q)) return 0;
    const words = `${name} ${label}`.split(' ');
    if (words.some((w) => w.startsWith(q))) return 1;
    return 2;
  };
  return [...items].sort((a, b) => score(a) - score(b));
}

/** Most-recent-first, case-insensitively deduplicated, capped list. */
export function pushRecentSearch(
  list: string[],
  query: string,
  max: number = MAX_RECENT_SEARCHES,
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return list;
  const rest = list.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...rest].slice(0, max);
}
