import { describe, expect, it } from 'vitest';
import {
  buildFtsMatchQuery,
  normalizeTerm,
  pushRecentSearch,
  rankSearchResults,
  tokenizeQuery,
} from './search-query';

describe('normalizeTerm / tokenizeQuery', () => {
  it('lowercases and strips FTS syntax characters', () => {
    expect(normalizeTerm('  White "Pot" OR (x)*  ')).toBe('white pot or x');
    expect(tokenizeQuery('white-pot')).toEqual(['white', 'pot']);
  });

  it('returns no tokens for junk-only input', () => {
    expect(tokenizeQuery('***"()')).toEqual([]);
  });
});

describe('buildFtsMatchQuery', () => {
  it('produces a prefix query for a single plain term', () => {
    expect(buildFtsMatchQuery('vase')).toBe('vase*');
  });

  it('AND-joins multi-token queries — no built-in vocabulary', () => {
    expect(buildFtsMatchQuery('white lamp')).toBe('white* AND lamp*');
    // Regression guard for the deleted synonym table: nothing is invented.
    expect(buildFtsMatchQuery('couch')).toBe('couch*');
  });

  it('OR-widens with caller-supplied semantic expansions', () => {
    expect(buildFtsMatchQuery('couch', ['sofa', 'settee'])).toBe('couch* OR sofa* OR settee*');
  });

  it('parenthesizes the multi-token base so expansions only widen', () => {
    expect(buildFtsMatchQuery('white lamp', ['sconce'])).toBe('(white* AND lamp*) OR sconce*');
  });

  it('quotes multi-word expansions and drops echoes/dupes/junk', () => {
    expect(buildFtsMatchQuery('planter', ['plant pot', 'planter', 'PLANT POT', '  '])).toBe(
      'planter* OR "plant pot"*',
    );
  });

  it('sanitizes FTS syntax in both the query and the expansions', () => {
    expect(buildFtsMatchQuery('label:evil OR "x"')).toBe('label* AND evil* AND or* AND x*');
    expect(buildFtsMatchQuery('vase', ['evil" OR label:*'])).toBe('vase* OR "evil or label"*');
  });

  it('returns null for empty/junk queries', () => {
    expect(buildFtsMatchQuery('   ')).toBeNull();
    expect(buildFtsMatchQuery('"*"')).toBeNull();
    expect(buildFtsMatchQuery('   ', ['sofa'])).toBeNull();
  });
});

describe('rankSearchResults', () => {
  const item = (label: string, description = '') => ({ label, description });

  it('ranks exact-prefix hits above word-prefix hits above fuzzy hits', () => {
    const results = rankSearchResults(
      [item('table lamp'), item('lamp'), item('chandelier', 'hanging light fixture')],
      'lam',
    );
    expect(results.map((r) => r.label)).toEqual(['lamp', 'table lamp', 'chandelier']);
  });

  it('keeps the incoming order for ties (stable)', () => {
    const results = rankSearchResults([item('sofa one'), item('sofa two')], 'sofa');
    expect(results.map((r) => r.label)).toEqual(['sofa one', 'sofa two']);
  });

  it('returns the input untouched for empty queries', () => {
    const input = [item('b'), item('a')];
    expect(rankSearchResults(input, '')).toEqual(input);
  });
});

describe('pushRecentSearch', () => {
  it('prepends, dedupes case-insensitively, and caps at 8', () => {
    let list: string[] = [];
    for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
      list = pushRecentSearch(list, q);
    }
    expect(list).toHaveLength(8);
    expect(list[0]).toBe('i');
    expect(list).not.toContain('a');

    list = pushRecentSearch(list, 'C');
    expect(list[0]).toBe('C');
    expect(list.filter((x) => x.toLowerCase() === 'c')).toHaveLength(1);
  });

  it('ignores blank queries', () => {
    expect(pushRecentSearch(['sofa'], '   ')).toEqual(['sofa']);
  });
});
