import { describe, expect, it } from 'vitest';
import { parseSseChunks, splitSseEvents } from './sse';

describe('splitSseEvents', () => {
  it('splits on blank lines, handles \\r\\n line endings', () => {
    const buf = 'event: a\r\ndata: 1\r\n\r\nevent: b\r\ndata: 2\r\n\r\n';
    expect(splitSseEvents(buf)).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('ignores keepalive comments', () => {
    const buf = ':keepalive\n\nevent: a\ndata: 1\n\n';
    expect(splitSseEvents(buf)).toEqual([{ event: 'a', data: '1' }]);
  });

  it('returns the trailing partial fragment as remainder when no blank line yet', () => {
    const { remainder } = parseSseChunks('event: x\ndata: ');
    expect(remainder).toBe('event: x\ndata: ');
  });
});
