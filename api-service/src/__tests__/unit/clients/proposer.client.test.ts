import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from 'undici';
import { ProposerClient } from '../../../clients/proposer.client';
import { DetectorUnavailableError } from '../../../clients/vlm-client';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

const ITEMS = [
  {
    label: 'coffee mug',
    category: 'Kitchenware',
    box: { x: 0.31, y: 0.52, width: 0.12, height: 0.18 },
  },
  {
    label: 'floor lamp',
    category: 'Lighting',
    box: { x: 0.7, y: 0.2, width: 0.1, height: 0.4 },
  },
];

function makeClient(timeoutMs = 50) {
  return new ProposerClient({ baseUrl: 'http://127.0.0.1:8001/', timeoutMs });
}

function okResponse(items: unknown = ITEMS) {
  return { ok: true, json: async () => ({ items }) };
}

describe('ProposerClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the jpeg to {baseUrl}/detect and maps the items array', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse());

    const out = await makeClient().detect(JPEG);

    expect(out).toEqual(ITEMS);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8001/detect'); // trailing slash stripped
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('image/jpeg');
    // Raw frame bytes go on the wire, not base64/multipart.
    expect(Buffer.from(init.body as Uint8Array).equals(JPEG)).toBe(true);
  });

  it('returns [] when the response carries no items array', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await makeClient().detect(JPEG)).toEqual([]);
  });

  it('throws DetectorUnavailableError on non-2xx', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    await expect(makeClient().detect(JPEG)).rejects.toBeInstanceOf(DetectorUnavailableError);
    await expect(makeClient().detect(JPEG)).rejects.toThrow('proposer returned 500');
  });

  it('throws DetectorUnavailableError when the proposer is unreachable', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    await expect(makeClient().detect(JPEG)).rejects.toBeInstanceOf(DetectorUnavailableError);
    await expect(makeClient().detect(JPEG)).rejects.toThrow('fetch failed');
  });

  it('throws DetectorUnavailableError naming the timeout on abort', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abortErr);
    await expect(makeClient(1234).detect(JPEG)).rejects.toThrow(
      'proposer request timed out after 1234ms',
    );
  });

  it('throws DetectorUnavailableError on unparseable JSON', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true, json: async () => JSON.parse('{not json') });
    await expect(makeClient().detect(JPEG)).rejects.toThrow('proposer returned invalid JSON');
  });
});

describe('ProposerClient dispatcher timeouts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes a custom dispatcher so undici 300s defaults do not apply', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse([]));
    const client = new ProposerClient({ baseUrl: 'http://127.0.0.1:8001', timeoutMs: 600_000 });

    await client.detect(JPEG);

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit & { dispatcher?: unknown };
      // Same regression guard as the VLM clients: the request must carry its
      // own dispatcher (timeouts set from timeoutMs), never undici's 300s
      // global defaults.
      expect(init.dispatcher).toBeInstanceOf(Agent);
    }
  });
});
