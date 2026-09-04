import { describe, expect, it } from 'vitest';
import {
  attributesForDisplay,
  deriveAttributes,
  extractAttributes,
  hasAttributes,
} from './attributes';

describe('extractAttributes', () => {
  it('reads a characteristics object from the detect payload', () => {
    expect(extractAttributes({ color: 'gold', material: 'wood', junk: 'x' })).toEqual({
      color: 'gold',
      material: 'wood',
    });
  });

  it('returns empty for the legacy string-array shape and non-objects', () => {
    expect(extractAttributes(['leather', 'brown'])).toEqual({});
    expect(extractAttributes(null)).toEqual({});
    expect(extractAttributes('gold')).toEqual({});
  });

  it('drops empty/non-string values and trims', () => {
    expect(extractAttributes({ color: '  gold  ', material: '', era: 42 })).toEqual({
      color: 'gold',
    });
  });
});

describe('deriveAttributes', () => {
  it('finds color, material, and era terms in label + description', () => {
    expect(deriveAttributes('framed painting', 'Gold framed vintage painting')).toEqual({
      color: 'gold',
      era: 'vintage',
    });
    expect(deriveAttributes('chair', 'wooden mid-century office chair')).toEqual({
      material: 'wood',
      era: 'mid-century',
    });
  });

  it('canonicalizes variants (golden → gold, metallic → metal)', () => {
    expect(deriveAttributes('lamp', 'golden metallic floor lamp')).toEqual({
      color: 'gold',
      material: 'metal',
    });
  });

  it('returns empty when nothing matches', () => {
    expect(deriveAttributes('thing', 'a nondescript object')).toEqual({});
  });
});

describe('hasAttributes / attributesForDisplay', () => {
  it('prefers non-empty persisted attributes over derivation', () => {
    expect(hasAttributes({ color: 'navy' })).toBe(true);
    expect(hasAttributes({ color: '' })).toBe(false);
    expect(hasAttributes(null)).toBe(false);

    expect(
      attributesForDisplay({
        label: 'gold vase',
        description: '',
        attributes: { color: 'navy' },
      }),
    ).toEqual({ color: 'navy' });
  });

  it('falls back to derivation for items without persisted attributes', () => {
    expect(
      attributesForDisplay({
        label: 'framed painting',
        description: 'gold framed painting',
        attributes: null,
      }),
    ).toEqual({ color: 'gold' });
  });
});
