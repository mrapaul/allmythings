import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * streamScoutEvents builds its multipart body inside the XHR closure, so the
 * vocab contract is verified against what actually leaves via send(): a fake
 * XMLHttpRequest captures the FormData, and the vocab helper is exercised for
 * real (provider registered, not mocked).
 */

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  responseText = '';
  status = 200;
  timeout = 0;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  readonly requestHeaders: Record<string, string> = {};
  sentBody: unknown = null;
  readonly url: string = '';
  readonly method: string = '';

  open(method: string, url: string): void {
    (this as { method: string }).method = method;
    (this as { url: string }).url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name.toLowerCase()] = value;
  }

  send(body: unknown): void {
    this.sentBody = body;
    queueMicrotask(() => this.onload?.());
  }

  abort(): void {
    queueMicrotask(() => this.onabort?.());
  }
}

import { streamScoutEvents } from './scout';
import type { DetectStreamEvent } from './types';
import { clearDetectVocabProvider, setDetectVocabProvider } from './vocab';

const FRAME = {
  fileUri: 'file:///scout.jpg',
  fileName: 'scout.jpg',
  mimeType: 'image/jpeg',
} as const;

describe('streamScoutEvents vocab attachment', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => {
    clearDetectVocabProvider();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the frame to the scout stream with SSE accept headers', async () => {
    const events: DetectStreamEvent[] = [];
    await streamScoutEvents(FRAME, { onEvent: (e) => events.push(e) });
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(xhr?.method).toBe('POST');
    expect(xhr?.url).toContain('/v1/detect/stream?mode=scout');
    expect(xhr?.requestHeaders.accept).toBe('text/event-stream');
  });

  it('attaches the inventory vocabulary as the vocab multipart field', async () => {
    setDetectVocabProvider(async () => ['sofa', 'Lamp']);
    await streamScoutEvents(FRAME, { onEvent: () => undefined });
    const body = FakeXMLHttpRequest.instances[0]?.sentBody as FormData;
    expect(JSON.parse(body.get('vocab') as string)).toEqual(['sofa', 'Lamp']);
    expect(body.get('frame')).not.toBeNull();
  });

  it('omits the vocab field when the inventory has nothing to say', async () => {
    setDetectVocabProvider(async () => []);
    await streamScoutEvents(FRAME, { onEvent: () => undefined });
    const body = FakeXMLHttpRequest.instances[0]?.sentBody as FormData;
    expect(body.get('vocab')).toBeNull();
  });

  it('still streams when the vocab provider throws', async () => {
    setDetectVocabProvider(async () => {
      throw new Error('db locked');
    });
    await expect(streamScoutEvents(FRAME, { onEvent: () => undefined })).resolves.toBeUndefined();
    const body = FakeXMLHttpRequest.instances[0]?.sentBody as FormData;
    expect(body.get('vocab')).toBeNull();
  });
});
