import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_ICON, categoryIcon } from './category-icons';

describe('categoryIcon', () => {
  it('maps the core categories to their glyphs', () => {
    expect(categoryIcon('Furniture')).toBe('archive');
    expect(categoryIcon('Lighting')).toBe('sun');
    expect(categoryIcon('Art')).toBe('image');
    expect(categoryIcon('Plant')).toBe('feather');
    expect(categoryIcon('Kitchen')).toBe('coffee');
    expect(categoryIcon('Books')).toBe('book-open');
    expect(categoryIcon('Electronics')).toBe('monitor');
  });

  it('is case-insensitive and trims', () => {
    expect(categoryIcon('  fUrNiTuRe ')).toBe('archive');
  });

  it('handles close variants', () => {
    expect(categoryIcon('Artwork')).toBe(categoryIcon('Art'));
    expect(categoryIcon('Clothes')).toBe(categoryIcon('Clothing'));
  });

  it('falls back to the default for unknown/absent categories', () => {
    expect(categoryIcon('Cryogenics')).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIcon('')).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIcon(null)).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryIcon(undefined)).toBe(DEFAULT_CATEGORY_ICON);
  });
});
