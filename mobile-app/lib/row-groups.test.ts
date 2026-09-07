import { describe, expect, it } from 'vitest';
import { MIN_GROUP_SIZE, groupCountLabel, groupRows } from './row-groups';

const row = (id: string, label: string) => ({ id, label });

describe('groupRows', () => {
  it('collapses identical labels once there are enough of them', () => {
    const groups = groupRows([
      row('a', 'black computer monitor'),
      row('b', 'white book'),
      row('c', 'white book'),
      row('d', 'White Book'),
      row('e', 'white keyboard'),
    ]);
    expect(groups.map((g) => [g.label, g.rowIds.length])).toEqual([
      ['black computer monitor', 1],
      ['white book', 3],
      ['white keyboard', 1],
    ]);
    expect(groupCountLabel(groups[1] as never)).toBe('× 3');
  });

  it('leaves a pair as separate rows — a count of two hides more than it saves', () => {
    const groups = groupRows([row('a', 'white book'), row('b', 'white book')]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.rowIds.length === 1)).toBe(true);
    expect(MIN_GROUP_SIZE).toBe(3);
  });

  it('keeps first-appearance order and never drops a row', () => {
    const rows = [
      row('1', 'lamp'),
      row('2', 'book'),
      row('3', 'lamp'),
      row('4', 'book'),
      row('5', 'book'),
      row('6', 'lamp'),
    ];
    const groups = groupRows(rows);
    expect(groups.map((g) => g.label)).toEqual(['lamp', 'book']);
    expect(groups.flatMap((g) => g.rowIds).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('distinguishes labels that differ in wording', () => {
    const groups = groupRows([
      row('a', 'white book'),
      row('b', 'white book'),
      row('c', 'white book'),
      row('d', 'white book with black text'),
      row('e', 'white book with black text'),
      row('f', 'white book with black text'),
    ]);
    expect(groups.map((g) => g.rowIds.length)).toEqual([3, 3]);
  });
});
