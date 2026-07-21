import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiVlmClient } from '../../../clients/gemini-vlm.client';
import { DetectorUnavailableError } from '../../../clients/vlm-client';

function makeClient() {
  return new GeminiVlmClient({
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    timeoutMs: 5000,
  });
}

function geminiResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

describe('GeminiVlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends inline image + prompt and returns concatenated part text', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(geminiResponse('{"items":[]}'));

    const out = await makeClient().generateJson('find items', 'BASE64DATA');

    expect(out).toBe('{"items":[]}');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/models/gemini-2.5-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].inline_data).toEqual({
      mime_type: 'image/jpeg',
      data: 'BASE64DATA',
    });
    expect(body.contents[0].parts[1].text).toBe('find items');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeUndefined();
  });

  it('includes responseSchema when a schema is passed', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(geminiResponse('{}'));
    const schema = { type: 'object', properties: { items: { type: 'array' } } };

    await makeClient().generateJson('p', 'img', schema);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.generationConfig.responseSchema).toEqual(schema);
  });

  it('maps HTTP 429 to a retryable rate_limit DetectorUnavailableError', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":{"message":"quota"}}',
    });

    const err = await makeClient()
      .generateJson('p', 'img')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DetectorUnavailableError);
    expect((err as DetectorUnavailableError).message).toContain('rate_limit');
    expect((err as DetectorUnavailableError).retryable).toBe(true);
  });

  it('wraps network failures in DetectorUnavailableError', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(makeClient().generateJson('p', 'img')).rejects.toBeInstanceOf(
      DetectorUnavailableError,
    );
  });

  it('throws when the response has no candidates', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await expect(makeClient().generateJson('p', 'img')).rejects.toBeInstanceOf(
      DetectorUnavailableError,
    );
  });
});
