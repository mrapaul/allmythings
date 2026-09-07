import { describe, expect, it, vi } from 'vitest';
import { resolveReachableServer } from './server-resolver';

function fakePrefs(override: string | null, discovered: string | null) {
  const state = { discovered };
  return {
    getApiBaseUrlOverride: () => override,
    getDiscoveredApiUrl: () => state.discovered,
    setDiscoveredApiUrl: (u: string | null) => {
      state.discovered = u;
    },
    state,
  };
}

describe('resolveReachableServer', () => {
  it('falls past a configured address that no longer answers', async () => {
    const prefs = fakePrefs('http://dead:14000', null);
    const verify = vi.fn(async (u: string) => u === 'http://127.0.0.1:14000');
    const url = await resolveReachableServer(prefs, { verify, extraDefault: 'http://lan:14000' });
    expect(url).toBe('http://127.0.0.1:14000');
    expect(verify.mock.calls.map((c) => c[0])).toEqual([
      'http://dead:14000',
      'http://lan:14000',
      'http://127.0.0.1:14000',
    ]);
    // Remembered, so the next request does not probe again.
    expect(prefs.state.discovered).toBe('http://127.0.0.1:14000');
  });

  it('stops at the first address that answers', async () => {
    const prefs = fakePrefs(null, 'http://known:14000');
    const verify = vi.fn(async () => true);
    expect(await resolveReachableServer(prefs, { verify, extraDefault: 'http://lan:14000' })).toBe(
      'http://known:14000',
    );
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('returns null when nothing answers, leaving the queue to hold the photos', async () => {
    const prefs = fakePrefs(null, 'http://known:14000');
    const url = await resolveReachableServer(prefs, {
      verify: async () => false,
      extraDefault: 'http://lan:14000',
    });
    expect(url).toBeNull();
    // A dead address is not promoted to last-known-good.
    expect(prefs.state.discovered).toBe('http://known:14000');
  });
});
