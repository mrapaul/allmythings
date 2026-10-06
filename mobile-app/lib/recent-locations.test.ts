import { describe, expect, it } from 'vitest';
import { MAX_RECENT_LOCATIONS, pushRecentLocation } from './recent-locations';

describe('pushRecentLocation', () => {
  it('prepends the trimmed location, most recent first', () => {
    expect(pushRecentLocation(['garage'], '  hallway closet ')).toEqual([
      'hallway closet',
      'garage',
    ]);
  });

  it('dedupes case-insensitively and bumps the existing entry to the front', () => {
    expect(pushRecentLocation(['Hallway Closet', 'garage'], 'hallway closet')).toEqual([
      'hallway closet',
      'garage',
    ]);
  });

  it('drops blank input without touching the list', () => {
    expect(pushRecentLocation(['garage'], '   ')).toEqual(['garage']);
  });

  it('caps the list at MAX_RECENT_LOCATIONS', () => {
    let list: string[] = [];
    for (let i = 0; i < MAX_RECENT_LOCATIONS + 3; i++) {
      list = pushRecentLocation(list, `spot ${i}`);
    }
    expect(list).toHaveLength(MAX_RECENT_LOCATIONS);
    expect(list[0]).toBe(`spot ${MAX_RECENT_LOCATIONS + 2}`);
  });
});
