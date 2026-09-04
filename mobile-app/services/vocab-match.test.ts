import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/api/client', () => ({ apiFetch: apiFetchMock }));

const { clearVocabCache, matchVocabulary, parseVocabMatches } = await import('./vocab-match');

describe('parseVocabMatches', () => {
  it('keeps confident string matches in order', () => {
    expect(
      parseVocabMatches({
        matches: [
          { value: 'sofa', score: 0.91 },
          { value: 'settee', score: 0.72 },
        ],
      }),
    ).toEqual(['sofa', 'settee']);
  });

  it('drops low scores, malformed entries, and duplicates', () => {
    expect(
      parseVocabMatches({
        matches: [
          { value: 'sofa', score: 0.9 },
          { value: 'SOFA', score: 0.8 },
          { value: 'couch', score: 0.1 },
          { value: 42, score: 0.9 },
          { score: 0.9 },
          null,
        ],
      }),
    ).toEqual(['sofa']);
  });

  it('returns empty for absent/garbage payloads (endpoint not deployed yet)', () => {
    expect(parseVocabMatches(undefined)).toEqual([]);
    expect(parseVocabMatches({})).toEqual([]);
    expect(parseVocabMatches({ matches: 'nope' })).toEqual([]);
    expect(parseVocabMatches('<html>404</html>')).toEqual([]);
  });
});

describe('matchVocabulary', () => {
  beforeEach(() => {
    clearVocabCache();
    apiFetchMock.mockReset();
  });
  afterEach(() => {
    clearVocabCache();
  });

  it('returns parsed expansions from the endpoint', async () => {
    apiFetchMock.mockResolvedValue({ matches: [{ value: 'sofa', score: 0.9 }] });
    await expect(matchVocabulary('couch', ['sofa', 'lamp'])).resolves.toEqual(['sofa']);
  });

  it('falls back silently to no expansions when the endpoint fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('404 Not Found'));
    await expect(matchVocabulary('couch', ['sofa'])).resolves.toEqual([]);
  });

  it('caches per query (including failures) so keystrokes do not re-request', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));
    await matchVocabulary('couch', ['sofa']);
    await matchVocabulary('COUCH', ['sofa']);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('never calls the endpoint without a query or vocabulary', async () => {
    await expect(matchVocabulary('  ', ['sofa'])).resolves.toEqual([]);
    await expect(matchVocabulary('couch', [])).resolves.toEqual([]);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
