import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

import { _testParseStreamLine } from './detect';

describe('detect helpers', () => {
  it('_testParseStreamLine maps "item"', () => {
    const ev = _testParseStreamLine({
      event: 'item',
      data: '{"label":"X","description":"","category":"C","tags":[],"box":{"x":0,"y":0,"width":1,"height":1}}',
    });
    expect(ev.type).toBe('item');
    if (ev.type === 'item') expect(ev.item.label).toBe('X');
  });

  it('_testParseStreamLine maps "done"', () => {
    const ev = _testParseStreamLine({
      event: 'done',
      data: '{"runId":"r","totalItems":3}',
    });
    expect(ev).toEqual({ type: 'done', runId: 'r', totalItems: 3 });
  });
});
