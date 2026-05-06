import { describe, expect, it } from 'vitest';
import { Prefs } from './prefs';

describe('Prefs (in-memory backend)', () => {
  it('stores active home id', () => {
    const p = Prefs.makeInMemory();
    expect(p.getActiveHomeId()).toBeNull();
    p.setActiveHomeId('h1');
    expect(p.getActiveHomeId()).toBe('h1');
  });

  it('stores profile', () => {
    const p = Prefs.makeInMemory();
    p.setProfile({ name: 'You', initials: 'Y' });
    expect(p.getProfile()).toEqual({ name: 'You', initials: 'Y' });
  });
});
