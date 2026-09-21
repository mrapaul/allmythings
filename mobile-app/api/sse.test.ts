import { describe, expect, it } from 'vitest';
import { createSseParser } from './sse';

describe('createSseParser', () => {
  it('parses a complete event: block', () => {
    const parser = createSseParser();
    const messages = parser.feed('event: item\ndata: {"label":"Vase"}\n\n');
    expect(messages).toEqual([{ event: 'item', data: '{"label":"Vase"}' }]);
  });

  it('yields nothing until the block terminator arrives', () => {
    const parser = createSseParser();
    expect(parser.feed('event: item\ndata: {"label":"Va')).toEqual([]);
    const messages = parser.feed('se"}\n\n');
    expect(messages).toEqual([{ event: 'item', data: '{"label":"Vase"}' }]);
  });

  it('handles multiple events in one chunk', () => {
    const parser = createSseParser();
    const messages = parser.feed(
      'event: meta\ndata: {"runId":"r1"}\n\nevent: done\ndata: {"totalItems":0}\n\n',
    );
    expect(messages.map((m) => m.event)).toEqual(['meta', 'done']);
  });

  it('ignores keepalive comment blocks and events without data', () => {
    const parser = createSseParser();
    const messages = parser.feed(':keepalive\n\nevent: ping\n\ndata: {"x":1}\n\n');
    expect(messages).toEqual([{ event: null, data: '{"x":1}' }]);
  });

  it('tolerates CRLF line endings', () => {
    const parser = createSseParser();
    const messages = parser.feed('event: item\r\ndata: {"a":1}\r\n\r\n');
    expect(messages).toEqual([{ event: 'item', data: '{"a":1}' }]);
  });

  it('joins multi-line data payloads', () => {
    const parser = createSseParser();
    const messages = parser.feed('event: item\ndata: {"a":\ndata: 1}\n\n');
    expect(messages).toEqual([{ event: 'item', data: '{"a":\n1}' }]);
  });

  it('keeps leftover partial blocks buffered across feeds', () => {
    const parser = createSseParser();
    expect(parser.feed('event: it')).toEqual([]);
    expect(parser.feed('em\ndata: {"l')).toEqual([]);
    expect(parser.feed('abel":"A"}\n\nevent: done\ndata: {}\n\n')).toEqual([
      { event: 'item', data: '{"label":"A"}' },
      { event: 'done', data: '{}' },
    ]);
  });
});
