import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAiVlmClient } from '../../../clients/openai-vlm.client';
import { DetectorUnavailableError } from '../../../clients/vlm-client';

function makeClient() {
  return new OpenAiVlmClient({
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'mlx-community/Qwen3-VL-30B-A3B-Instruct-4bit',
    timeoutMs: 50,
    retryDelayMs: 1,
  });
}

function okResponse(text: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  };
}

describe('OpenAiVlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a chat completion with the image as a data URL and JSON mode on', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{"items":[]}'));

    const out = await makeClient().generateJson('list things', 'AAAA');

    expect(out).toBe('{"items":[]}');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('mlx-community/Qwen3-VL-30B-A3B-Instruct-4bit');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.stream).toBe(false);
    const content = body.messages[0].content;
    expect(content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,AAAA' },
    });
    expect(content[1]).toEqual({ type: 'text', text: 'list things' });
  });

  it('sends a bearer token only when an api key is configured', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okResponse('{}'));
    await makeClient().generateJson('p', 'img');
    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers.authorization).toBeUndefined();

    const keyed = new OpenAiVlmClient({
      baseUrl: 'http://x/v1',
      model: 'm',
      timeoutMs: 50,
      apiKey: 'secret',
    });
    await keyed.generateJson('p', 'img');
    const h2 = (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(h2.authorization).toBe('Bearer secret');
  });

  it('retries a 5xx once and then succeeds', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce(okResponse('{"items":[1]}'));
    const out = await makeClient().generateJson('p', 'img');
    expect(out).toBe('{"items":[1]}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws DetectorUnavailableError without retry on 4xx', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' });
    await expect(makeClient().generateJson('p', 'img')).rejects.toBeInstanceOf(
      DetectorUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty text when the response carries no content', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    expect(await makeClient().generateJson('p', 'img')).toBe('');
  });
});
