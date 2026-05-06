import { describe, expect, it } from 'vitest';
import { resolveResponsive } from './useResponsive';

describe('resolveResponsive', () => {
  it('sm < md < lg < xl breakpoints map correctly', () => {
    expect(resolveResponsive(320).breakpoint).toBe('sm');
    expect(resolveResponsive(600).breakpoint).toBe('md');
    expect(resolveResponsive(1000).breakpoint).toBe('lg');
    expect(resolveResponsive(1400).breakpoint).toBe('xl');
  });

  it('column count grows with width', () => {
    expect(resolveResponsive(320).columns).toBe(2);
    expect(resolveResponsive(600).columns).toBe(3);
    expect(resolveResponsive(1000).columns).toBe(4);
    expect(resolveResponsive(1400).columns).toBeGreaterThanOrEqual(5);
  });

  it('content max-width clamps on lg/xl', () => {
    expect(resolveResponsive(1000).contentMaxWidth).toBeLessThanOrEqual(920);
    expect(resolveResponsive(1400).contentMaxWidth).toBeLessThanOrEqual(1100);
  });
});
