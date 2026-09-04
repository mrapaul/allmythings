import { describe, expect, it } from 'vitest';
import { isPossibleDuplicate } from './duplicates';

const chair = [
  { key: 'type', value: 'chair' },
  { key: 'color', value: 'orange' },
];

describe('isPossibleDuplicate', () => {
  it('flags matching type + color', () => {
    expect(isPossibleDuplicate(chair, [chair])).toBe(true);
    expect(
      isPossibleDuplicate(chair, [
        [
          { key: 'type', value: 'Chair' },
          { key: 'color', value: 'ORANGE' },
        ],
      ]),
    ).toBe(true);
  });

  it('does not flag same type with a different color', () => {
    expect(
      isPossibleDuplicate(chair, [
        [
          { key: 'type', value: 'chair' },
          { key: 'color', value: 'teal' },
        ],
      ]),
    ).toBe(false);
  });

  it('matches colorless rows only against colorless items of the same type', () => {
    const plainChair = [{ key: 'type', value: 'chair' }];
    expect(isPossibleDuplicate(plainChair, [[{ key: 'type', value: 'chair' }]])).toBe(true);
    expect(isPossibleDuplicate(plainChair, [chair])).toBe(false);
  });

  it('never flags rows without a type', () => {
    expect(isPossibleDuplicate([{ key: 'color', value: 'orange' }], [chair])).toBe(false);
  });
});
