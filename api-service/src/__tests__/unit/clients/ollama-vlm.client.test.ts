import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
