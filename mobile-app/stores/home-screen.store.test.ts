import { describe, expect, it } from 'vitest';
import { createHomeScreenStore } from './home-screen.store';

describe('homeScreenStore', () => {
  it('cycles sort: newest → oldest → alpha → newest', () => {
    const s = createHomeScreenStore();
    expect(s.getState().sort).toBe('newest');
    s.getState().cycleSort();
    expect(s.getState().sort).toBe('oldest');
    s.getState().cycleSort();
    expect(s.getState().sort).toBe('alpha');
    s.getState().cycleSort();
    expect(s.getState().sort).toBe('newest');
  });

  it('clears category filter when set to null', () => {
    const s = createHomeScreenStore();
    s.getState().setCategory('Furniture');
    expect(s.getState().category).toBe('Furniture');
    s.getState().setCategory(null);
    expect(s.getState().category).toBeNull();
  });
});
