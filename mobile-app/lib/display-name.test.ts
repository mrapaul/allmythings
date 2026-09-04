import { describe, expect, it } from 'vitest';
import { displayName, humanizeLabel, ordinalDisplayNames } from './display-name';

describe('humanizeLabel', () => {
  it('converts snake_case model output to sentence case', () => {
    expect(humanizeLabel('office_chair')).toBe('Office chair');
    expect(humanizeLabel('plant-pot')).toBe('Plant pot');
    expect(humanizeLabel('lamp')).toBe('Lamp');
  });

  it('preserves existing capitalization beyond the first character', () => {
    expect(humanizeLabel('TV stand')).toBe('TV stand');
  });

  it('collapses repeated separators and trims', () => {
    expect(humanizeLabel('  coffee__table  ')).toBe('Coffee table');
  });

  it('returns empty string for empty input', () => {
    expect(humanizeLabel('')).toBe('');
    expect(humanizeLabel('  ')).toBe('');
  });
});

describe('displayName', () => {
  it('prefers a name-sized description over the label', () => {
    expect(displayName({ label: 'plant_pot', description: 'white ceramic plant pot' })).toBe(
      'White ceramic plant pot',
    );
  });

  it('falls back to the humanized label when the description is empty', () => {
    expect(displayName({ label: 'office_chair', description: '' })).toBe('Office chair');
  });

  it('falls back to the label when the description reads as a sentence', () => {
    const longDesc = 'a very long user-written note about where this item came from originally';
    expect(displayName({ label: 'vase', description: longDesc })).toBe('Vase');
  });
});

describe('ordinalDisplayNames', () => {
  const item = (id: string, label: string, description = '') => ({ id, label, description });

  it('leaves unique names unsuffixed', () => {
    const map = ordinalDisplayNames([item('a', 'sofa'), item('b', 'lamp')]);
    expect(map.get('a')).toBe('Sofa');
    expect(map.get('b')).toBe('Lamp');
  });

  it('suffixes ordinals from the second duplicate onward, in encounter order', () => {
    const map = ordinalDisplayNames([
      item('a', 'plant_pot'),
      item('b', 'lamp'),
      item('c', 'plant pot'),
      item('d', 'plant_pot'),
    ]);
    expect(map.get('a')).toBe('Plant pot');
    expect(map.get('c')).toBe('Plant pot · 2');
    expect(map.get('d')).toBe('Plant pot · 3');
    expect(map.get('b')).toBe('Lamp');
  });

  it('distinct descriptions keep duplicate labels naturally distinct', () => {
    const map = ordinalDisplayNames([
      item('a', 'plant_pot', 'white ceramic plant pot'),
      item('b', 'plant_pot', 'black plant pot'),
    ]);
    expect(map.get('a')).toBe('White ceramic plant pot');
    expect(map.get('b')).toBe('Black plant pot');
  });
});
