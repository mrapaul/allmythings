import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from 'undici';
import { OllamaVlmClient, OllamaUnavailableError } from '../../../clients/ollama-vlm.client';

function makeClient() {
  return new OllamaVlmClient({
    baseUrl: 'http://localhost:11434',
    model: 'gemma4:31b-cloud',
    timeoutMs: 50,
    retryDelayMs: 1,
  });
}

function okResponse(text: string) {
  return { ok: true, json: async () => ({ response: text }) };
}

describe('OllamaVlmClient retry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries once after a timeout and returns the second attempt', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abortErr).mockResolvedValueOnce(okResponse('{"items":[]}'));

    const out = await makeClient().generateJson('p', 'img');

    expect(out).toBe('{"items":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails after all retries also time out', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abortErr);

    await expect(makeClient().generateJson('p', 'img')).rejects.toBeInstanceOf(
      OllamaUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors (4xx)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'no model' });

    await expect(makeClient().generateJson('p', 'img')).rejects.toBeInstanceOf(
      OllamaUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx once', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce(okResponse('{}'));

    const out = await makeClient().generateJson('p', 'img');
    expect(out).toBe('{}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('OllamaVlmClient residency', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the configured keep_alive on every generate call', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{}'));
    const client = new OllamaVlmClient({
      baseUrl: 'http://localhost:11434',
      model: 'm',
      timeoutMs: 50,
      keepAlive: '1h',
    });

    await client.generateJson('p', 'img');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.keep_alive).toBe('1h');
  });

  it('warm() loads the model with an empty prompt and never throws', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(okResponse('')).mockRejectedValueOnce(new Error('down'));
    const client = new OllamaVlmClient({
      baseUrl: 'http://localhost:11434',
      model: 'm',
      timeoutMs: 50,
      keepAlive: '1h',
    });

    await client.warm();
    await client.warm(); // fetch rejects — must be swallowed

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ model: 'm', keep_alive: '1h' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('OllamaVlmClient think flag', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards think=false when configured', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{"items":[]}'));
    const client = new OllamaVlmClient({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3.6:35b-a3b',
      timeoutMs: 50,
      think: false,
    });
    await client.generateJson('p', 'img');
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.think).toBe(false);
  });

  it('omits think when not configured (models without thinking reject it)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{"items":[]}'));
    await makeClient().generateJson('p', 'img');
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect('think' in body).toBe(false);
  });
});

describe('OllamaVlmClient dispatcher timeouts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes a custom dispatcher so undici 300s defaults do not apply', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{}'));
    const client = new OllamaVlmClient({
      baseUrl: 'http://localhost:11434',
      model: 'm',
      timeoutMs: 900_000,
    });

    await client.generateJson('p', 'img');
    await client.warm();

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit & { dispatcher?: unknown };
      // Regression guard: global fetch applies undici's 300s
      // headersTimeout/bodyTimeout, which kills CPU-bound vision prefills
      // with a bare "fetch failed". The client must always bring its own
      // dispatcher (timeouts are constructor-set to timeoutMs; undici keeps
      // them in private symbol fields, not inspectable here).
      expect(init.dispatcher).toBeInstanceOf(Agent);
    }
  });
});

describe('OllamaVlmClient context size', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends num_ctx on generate and on warm so the runner is sized once', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{}'));
    const client = new OllamaVlmClient({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3-vl:4b-instruct',
      timeoutMs: 50,
      numCtx: 4096,
    });
    await client.generateJson('p', 'img');
    await client.warm();
    const gen = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    const warm = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(gen.options.num_ctx).toBe(4096);
    expect(warm.options.num_ctx).toBe(4096);
  });
});
