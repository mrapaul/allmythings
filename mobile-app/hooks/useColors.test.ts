import { describe, expect, it } from 'vitest';
import { resolveColors } from './useColors';

describe('resolveColors', () => {
  it('returns the light palette for "light"', () => {
    const c = resolveColors('light');
    expect(c.background).toMatch(/^#/);
    expect(c.primary).toMatch(/^#/);
  });

  it('returns the dark palette for "dark"', () => {
    const c = resolveColors('dark');
    expect(c.background).toMatch(/^#/);
    expect(c).not.toEqual(resolveColors('light'));
  });
});
