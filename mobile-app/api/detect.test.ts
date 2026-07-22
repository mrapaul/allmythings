import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

import { _testParseStreamLine, detectImageStream } from './detect';

/** Scriptable XMLHttpRequest stand-in that replays SSE chunks. */
class FakeXhr {
  static script: { chunks: string[]; status?: number } = { chunks: [] };
  status = 0;
  responseText = '';
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open(): void {}
  setRequestHeader(): void {}
  abort(): void {}
  send(): void {
    setTimeout(() => {
      this.status = FakeXhr.script.status ?? 200;
      for (const chunk of FakeXhr.script.chunks) {
        this.responseText += chunk;
        this.onprogress?.();
      }
      this.onload?.();
    }, 0);
  }
}

describe('detectImageStream over XHR', () => {
  it('yields parsed events from chunked SSE, including a split chunk', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    FakeXhr.script = {
      chunks: [
        'event: meta\ndata: {"runId":"r","traceId":"t","photoSha256":"aa"}\n\n:keepalive\n\nevent: item\ndata: {"label":"sofa","description":"","category":"Furniture","tags":[],"box":{"x":0,"y":0,"width":1,"height":1}}\n\nevent: it',
        'em\ndata: {"label":"lamp","description":"","category":"Lighting","tags":[],"box":{"x":0,"y":0,"width":1,"height":1}}\n\nevent: done\ndata: {"runId":"r","totalItems":2}\n\n',
      ],
    };
    try {
      const events = [];
      for await (const ev of detectImageStream({
        fileUri: 'file:///x.jpg',
        fileName: 'x.jpg',
        mimeType: 'image/jpeg',
      })) {
        events.push(ev);
      }
      expect(events.map((e) => e.type)).toEqual(['meta', 'item', 'item', 'done']);
      expect(events[1]).toMatchObject({ type: 'item', item: { label: 'sofa' } });
      expect(events[2]).toMatchObject({ type: 'item', item: { label: 'lamp' } });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects on a non-200 response', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    FakeXhr.script = { chunks: [], status: 503 };
    try {
      await expect(async () => {
        for await (const _ of detectImageStream({
          fileUri: 'file:///x.jpg',
          fileName: 'x.jpg',
          mimeType: 'image/jpeg',
        })) {
          void _;
        }
      }).rejects.toThrow('detect/stream HTTP 503');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('detect helpers', () => {
  it('_testParseStreamLine maps "item"', () => {
    const ev = _testParseStreamLine({
      event: 'item',
      data: '{"label":"X","description":"","category":"C","tags":[],"box":{"x":0,"y":0,"width":1,"height":1}}',
    });
    expect(ev.type).toBe('item');
    if (ev.type === 'item') expect(ev.item.label).toBe('X');
  });

  it('_testParseStreamLine maps "scene"', () => {
    const ev = _testParseStreamLine({
      event: 'scene',
      data: '{"type":"room","estimatedTotalItems":12,"verdict":"too_blurry","verdictReason":"motion blur"}',
    });
    expect(ev).toEqual({
      type: 'scene',
      scene: {
        type: 'room',
        estimatedTotalItems: 12,
        verdict: 'too_blurry',
        verdictReason: 'motion blur',
      },
    });
  });

  it('_testParseStreamLine keeps photoSha256 from "meta"', () => {
    const ev = _testParseStreamLine({
      event: 'meta',
      data: '{"runId":"r","traceId":"t","photoSha256":"abc123"}',
    });
    expect(ev).toEqual({ type: 'meta', runId: 'r', traceId: 't', photoSha256: 'abc123' });
  });

  it('_testParseStreamLine maps "done"', () => {
    const ev = _testParseStreamLine({
      event: 'done',
      data: '{"runId":"r","totalItems":3}',
    });
    expect(ev).toEqual({ type: 'done', runId: 'r', totalItems: 3 });
  });
});
