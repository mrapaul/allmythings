import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { florenceDetect } from '../../../../temporal/activities/florence-detect.activity';
import { DetectInput } from '../../../../temporal/shared-types';

describe('florenceDetect activity', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function makeInput(): DetectInput {
    return {
      imageBase64: Buffer.from('fake-jpeg').toString('base64'),
      imageSha256: 'abc',
      mimeType: 'image/jpeg',
      traceId: 't',
      requestId: 'r',
    };
  }

  it('maps HTTP regions to FlorenceDetection with regionIndex', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        regions: [
          { caption: 'desk lamp', x: 0.1, y: 0.2, width: 0.15, height: 0.25 },
          { caption: 'blue sofa', x: 0.5, y: 0.3, width: 0.4, height: 0.5 },
        ],
        image_width: 1920,
        image_height: 1080,
      }),
    } as Response);

    const result = await florenceDetect(makeInput());
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].regionIndex).toBe(0);
    expect(result.regions[1].regionIndex).toBe(1);
    expect(result.regions[0].caption).toBe('desk lamp');
    expect(result.imageWidth).toBe(1920);
  });

  it('returns empty regions on zero detections', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [], image_width: 640, image_height: 480 }),
    } as Response);

    const result = await florenceDetect(makeInput());
    expect(result.regions).toEqual([]);
  });

  it('throws retryable ApplicationFailure on 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    } as Response);

    await expect(florenceDetect(makeInput())).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: false,
    });
  });

  it('throws non-retryable ApplicationFailure on 4xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 415,
      text: async () => 'unsupported',
    } as Response);

    await expect(florenceDetect(makeInput())).rejects.toMatchObject({
      name: 'ApplicationFailure',
      nonRetryable: true,
    });
  });

  it('posts to the configured Florence URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ regions: [], image_width: 1, image_height: 1 }),
    } as Response);

    await florenceDetect(makeInput());
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toMatch(/\/detect\/florence$/);
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toBeDefined();
  });
});
