import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { DetectorUnavailableError, type VlmClient } from '../../../clients/vlm-client';
import { OllamaUnavailableError } from '../../../clients/ollama-vlm.client';
import { VlmDetector } from '../../../services/vlm-detector';

describe('DetectorUnavailableError', () => {
  it('is the base class of OllamaUnavailableError', () => {
    const err = new OllamaUnavailableError('connection refused');
    expect(err).toBeInstanceOf(DetectorUnavailableError);
    expect(err.name).toBe('OllamaUnavailableError');
  });

  it('defaults to retryable', () => {
    expect(new DetectorUnavailableError('boom').retryable).toBe(true);
    expect(new DetectorUnavailableError('fatal', false).retryable).toBe(false);
  });
});

describe('VlmClient interface', () => {
  it('lets VlmDetector run against any structural VlmClient (no cast)', async () => {
    const client: VlmClient = {
      modelName: 'stub-model',
      generateJson: async () =>
        JSON.stringify({
          items: [
            {
              object: 'desk lamp',
              category: 'Lighting',
              bounding_box: { x_min: 0.1, y_min: 0.1, x_max: 0.3, y_max: 0.4 },
              tags: { color: 'black' },
            },
          ],
        }),
    };
    const image = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const detector = new VlmDetector(client, {
      twoPass: false,
      maxImageSize: 256,
      coordMode: 'auto',
    });
    const items = await detector.detect(image);
    expect(items.map((i) => i.label)).toEqual(['desk lamp']);
  });
});
