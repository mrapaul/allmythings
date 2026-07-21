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

  it('stores profile', () => {
    const p = Prefs.makeInMemory();
    p.setProfile({ name: 'You', initials: 'Y' });
    expect(p.getProfile()).toEqual({ name: 'You', initials: 'Y' });
  });
});
