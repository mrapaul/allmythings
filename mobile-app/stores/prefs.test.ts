import { describe, expect, it } from 'vitest';
import { Prefs } from './prefs';

describe('Prefs (in-memory backend)', () => {
  it('stores active home id', () => {
    const p = Prefs.makeInMemory();
    expect(p.getActiveHomeId()).toBeNull();
    p.setActiveHomeId('h1');
    expect(p.getActiveHomeId()).toBe('h1');
  });

  it('stores and clears the API base URL override', () => {
    const p = Prefs.makeInMemory();
    expect(p.getApiBaseUrlOverride()).toBeNull();
    p.setApiBaseUrlOverride('http://my-mac.tail1234.ts.net:14000');
    expect(p.getApiBaseUrlOverride()).toBe('http://my-mac.tail1234.ts.net:14000');
    p.setApiBaseUrlOverride(null);
    expect(p.getApiBaseUrlOverride()).toBeNull();
    // Whitespace-only never persists.
    p.setApiBaseUrlOverride('   ');
    expect(p.getApiBaseUrlOverride()).toBeNull();
  });

  it('stores and clears the discovered server URL', () => {
    const p = Prefs.makeInMemory();
    expect(p.getDiscoveredApiUrl()).toBeNull();
    p.setDiscoveredApiUrl('http://192.168.1.20:14000/');
    expect(p.getDiscoveredApiUrl()).toBe('http://192.168.1.20:14000');
    p.setDiscoveredApiUrl(null);
    expect(p.getDiscoveredApiUrl()).toBeNull();
  });

  it('round-trips pending captures and drops malformed entries', () => {
    const p = Prefs.makeInMemory();
    expect(p.getPendingCaptures()).toEqual([]);
    p.setPendingCaptures([{ id: 'c1', imageUri: 'file:///a.jpg', createdAt: 1, attempts: 0 }]);
    expect(p.getPendingCaptures()).toHaveLength(1);
    p.setPendingCaptures([]);
    expect(p.getPendingCaptures()).toEqual([]);
  });

  it('defaults the collection view to overview and honours stored legacy modes', () => {
    const p = Prefs.makeInMemory();
    expect(p.getCollectionViewMode()).toBe('overview');
    p.setCollectionViewMode('list');
    expect(p.getCollectionViewMode()).toBe('list');
    p.setCollectionViewMode('grid');
    expect(p.getCollectionViewMode()).toBe('grid');
    p.setCollectionViewMode('overview');
    expect(p.getCollectionViewMode()).toBe('overview');
  });

  it('round-trips recent searches and drops non-string entries', () => {
    const p = Prefs.makeInMemory();
    expect(p.getRecentSearches()).toEqual([]);
    p.setRecentSearches(['couch', 'lamp']);
    expect(p.getRecentSearches()).toEqual(['couch', 'lamp']);
    p.setRecentSearches([]);
    expect(p.getRecentSearches()).toEqual([]);
  });

  it('round-trips review state and clears it', () => {
    const p = Prefs.makeInMemory();
    expect(p.getReviewState()).toBeNull();
    p.setReviewState({
      runId: 'r1',
      tagsByRow: { '0-sofa': ['sofa', 'leather'] },
      excludedRowIds: ['1-lamp'],
      savedRowIds: [],
    });
    expect(p.getReviewState()?.runId).toBe('r1');
    expect(p.getReviewState()?.tagsByRow['0-sofa']).toEqual(['sofa', 'leather']);
    p.setReviewState(null);
    expect(p.getReviewState()).toBeNull();
  });

  it('round-trips merge suggestions and permanent dismissals', () => {
    const p = Prefs.makeInMemory();
    expect(p.getMergeSuggestions()).toEqual([]);
    expect(p.getDismissedSuggestions()).toEqual([]);
    p.setMergeSuggestions([
      {
        id: 'a::b',
        keepId: 'a',
        mergeId: 'b',
        source: 'local',
        confidence: 'medium',
        createdAt: 1,
      },
    ]);
    expect(p.getMergeSuggestions()).toHaveLength(1);
    p.setDismissedSuggestions(['c::d']);
    expect(p.getDismissedSuggestions()).toEqual(['c::d']);
    p.setMergeSuggestions([]);
    expect(p.getMergeSuggestions()).toEqual([]);
  });

  it('stores profile', () => {
    const p = Prefs.makeInMemory();
    p.setProfile({ name: 'You', initials: 'Y' });
    expect(p.getProfile()).toEqual({ name: 'You', initials: 'Y' });
  });
});
