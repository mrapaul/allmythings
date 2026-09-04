process.env.NODE_ENV = 'development';

import { describe, it, expect, vi } from 'vitest';
import { EnrichService, buildEnrichPrompt } from '../../../services/enrich.service';
import { DetectorUnavailableError, type VlmClient } from '../../../clients/vlm-client';

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function client(response: string | Error, delayMs = 0): VlmClient {
  return {
    modelName: 'stub',
    generateJson: async (): Promise<string> => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function modelJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    label: 'walnut mid-century sideboard',
    attributes: {
      color: 'walnut brown',
      material: 'wood',
      style: 'mid-century modern',
      era: '1960s',
      brand: null,
      model: null,
    },
    confidence: 0.85,
    description: 'A walnut mid-century sideboard with tapered legs.',
    ...overrides,
  });
}

function service(vlm: VlmClient, opts?: { timeoutMs?: number }) {
  return new EnrichService(vlm, { timeoutMs: 15_000, ...opts });
}

describe('EnrichService', () => {
  it('returns the enriched verdict for a clean model response', async () => {
    // Arrange
    const svc = service(client(modelJson()));

    // Act
    const result = await svc.enrich(TINY_JPEG, 'sideboard');

    // Assert
    expect(result).toEqual({
      label: 'walnut mid-century sideboard',
      attributes: {
        color: 'walnut brown',
        material: 'wood',
        style: 'mid-century modern',
        era: '1960s',
      },
      confidence: 0.85,
      description: 'A walnut mid-century sideboard with tapered legs.',
    });
  });

  it('drops null, empty and "unknown" attribute values', async () => {
    // Arrange
    const svc = service(
      client(
        modelJson({
          attributes: {
            color: 'red',
            material: 'unknown',
            style: '',
            era: null,
            brand: 'N/A',
            model: 42,
          },
        }),
      ),
    );

    // Act
    const result = await svc.enrich(TINY_JPEG);

    // Assert
    expect(result.attributes).toEqual({ color: 'red' });
  });

  it('ignores attribute keys outside the contract', async () => {
    // Arrange
    const svc = service(
      client(modelJson({ attributes: { color: 'blue', weight: 'heavy', price: '100' } })),
    );

    // Act
    const result = await svc.enrich(TINY_JPEG);

    // Assert
    expect(result.attributes).toEqual({ color: 'blue' });
  });

  it('salvages JSON wrapped in markdown fences and prose', async () => {
    // Arrange
    const svc = service(client('Here you go:\n```json\n' + modelJson() + '\n```'));

    // Act
    const result = await svc.enrich(TINY_JPEG);

    // Assert
    expect(result.label).toBe('walnut mid-century sideboard');
    expect(result.confidence).toBe(0.85);
  });

  it('salvages a missing confidence as null without voiding the label', async () => {
    // Arrange
    const svc = service(client(modelJson({ confidence: undefined })));

    // Act
    const result = await svc.enrich(TINY_JPEG);

    // Assert
    expect(result.label).toBe('walnut mid-century sideboard');
    expect(result.confidence).toBeNull();
  });

  it('salvages an out-of-range confidence as null', async () => {
    // Arrange
    const svc = service(client(modelJson({ confidence: 7 })));

    // Act
    const result = await svc.enrich(TINY_JPEG);

    // Assert
    expect(result.confidence).toBeNull();
  });

  it('fails open with the input label on unparseable model output', async () => {
    // Arrange
    const svc = service(client('sorry, I cannot help with that'));

    // Act
    const result = await svc.enrich(TINY_JPEG, 'blue armchair');

    // Assert
    expect(result).toEqual({
      label: 'blue armchair',
      attributes: {},
      confidence: null,
      description: '',
    });
  });

  it('fails open when the model omits the label', async () => {
    // Arrange
    const svc = service(client(modelJson({ label: '' })));

    // Act
    const result = await svc.enrich(TINY_JPEG, 'table lamp');

    // Assert
    expect(result.label).toBe('table lamp');
    expect(result.attributes).toEqual({});
    expect(result.confidence).toBeNull();
  });

  it('fails open when the model backend is unavailable', async () => {
    // Arrange
    const svc = service(client(new DetectorUnavailableError('ollama down')));

    // Act
    const result = await svc.enrich(TINY_JPEG, 'ceramic vase');

    // Assert
    expect(result.label).toBe('ceramic vase');
    expect(result.attributes).toEqual({});
    expect(result.confidence).toBeNull();
  });

  it('fails open when the model call exceeds the deadline', async () => {
    // Arrange
    const svc = service(client(modelJson(), 200), { timeoutMs: 50 });

    // Act
    const result = await svc.enrich(TINY_JPEG, 'floor lamp');

    // Assert
    expect(result.label).toBe('floor lamp');
    expect(result.confidence).toBeNull();
  });

  it('runs concurrent requests one at a time, in arrival order', async () => {
    // Arrange — the first call blocks on a gate; the second must not start.
    let releaseFirst = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const vlm: VlmClient = {
      modelName: 'stub',
      generateJson: vi.fn(async (): Promise<string> => {
        calls += 1;
        if (calls === 1) await gate;
        return modelJson({ label: `item ${calls}` });
      }),
    };
    const svc = service(vlm);

    // Act
    const first = svc.enrich(TINY_JPEG, 'first');
    const second = svc.enrich(TINY_JPEG, 'second');
    await new Promise((r) => setTimeout(r, 50));

    // Assert — only the first request has reached the model.
    expect(vlm.generateJson).toHaveBeenCalledTimes(1);

    releaseFirst();
    const [a, b] = await Promise.all([first, second]);
    expect(vlm.generateJson).toHaveBeenCalledTimes(2);
    expect(a.label).toBe('item 1');
    expect(b.label).toBe('item 2');
  });

  it('keeps the queue moving after a failed request', async () => {
    // Arrange — first call fails, second succeeds.
    let calls = 0;
    const vlm: VlmClient = {
      modelName: 'stub',
      generateJson: async (): Promise<string> => {
        calls += 1;
        if (calls === 1) throw new DetectorUnavailableError('down');
        return modelJson();
      },
    };
    const svc = service(vlm);

    // Act
    const [a, b] = await Promise.all([
      svc.enrich(TINY_JPEG, 'broken one'),
      svc.enrich(TINY_JPEG),
    ]);

    // Assert — the failure failed open and did not jam the queue.
    expect(a.label).toBe('broken one');
    expect(a.confidence).toBeNull();
    expect(b.label).toBe('walnut mid-century sideboard');
  });
});

describe('buildEnrichPrompt', () => {
  it('locks the output to JSON with the enrichment schema', () => {
    const prompt = buildEnrichPrompt();
    expect(prompt).toContain('ONE JSON object');
    expect(prompt).toContain('"label"');
    expect(prompt).toContain('"attributes"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('No markdown');
  });

  it('mentions the existing label when one is provided', () => {
    const prompt = buildEnrichPrompt('leather club chair');
    expect(prompt).toContain('previously labeled "leather club chair"');
  });

  it('omits the prior-label line when no label is provided', () => {
    expect(buildEnrichPrompt()).not.toContain('previously labeled');
  });

  it('never asks for is_possession — the item is already inventory', () => {
    expect(buildEnrichPrompt()).not.toContain('is_possession');
  });
});
