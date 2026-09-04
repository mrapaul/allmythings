process.env.NODE_ENV = 'development';

import { describe, it, expect } from 'vitest';
import { PrecheckService, buildPrecheckPrompt } from '../../../services/precheck.service';
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
    scene: 'interior',
    quality: 'ok',
    visible_object_count: 12,
    people_present: false,
    ...overrides,
  });
}

function service(vlm: VlmClient, opts?: { maxObjects?: number; timeoutMs?: number }) {
  return new PrecheckService(vlm, { maxObjects: 35, timeoutMs: 15_000, ...opts });
}

describe('PrecheckService', () => {
  it('marks a bright interior scene processable with no advice', async () => {
    // Arrange
    const svc = service(client(modelJson()));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result).toEqual({
      scene: 'interior',
      quality: 'ok',
      objectDensity: 'moderate',
      visibleObjectCount: 12,
      peoplePresent: false,
      processable: true,
      advice: null,
    });
  });

  it('exposes the raw model count as visibleObjectCount', async () => {
    // Arrange
    const svc = service(client(modelJson({ visible_object_count: 7 })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.visibleObjectCount).toBe(7);
    expect(result.objectDensity).toBe('moderate');
  });

  it('reports a zero count as 0, not null', async () => {
    // Arrange
    const svc = service(client(modelJson({ visible_object_count: 0 })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.visibleObjectCount).toBe(0);
    expect(result.objectDensity).toBe('none');
  });

  it('reports null visibleObjectCount when the model gives no usable number', async () => {
    // Arrange — a non-integer count is not a usable number.
    const svc = service(client(modelJson({ visible_object_count: 'lots' })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.visibleObjectCount).toBeNull();
    expect(result.objectDensity).toBe('none');
    expect(result.processable).toBe(true);
  });

  it('rejects an exterior scene with outdoor advice', async () => {
    // Arrange
    const svc = service(client(modelJson({ scene: 'exterior', visible_object_count: 3 })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.scene).toBe('exterior');
    expect(result.processable).toBe(false);
    expect(result.advice).toBe('This looks like the outdoors — inventory needs interior photos');
  });

  it('rejects a too-dark interior with lighting advice', async () => {
    // Arrange
    const svc = service(client(modelJson({ quality: 'too_dark', visible_object_count: 2 })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.quality).toBe('too_dark');
    expect(result.processable).toBe(false);
    expect(result.advice).toBe('Too dark — add some light');
  });

  it('buckets a count above the max-objects threshold as too_many but stays processable', async () => {
    // Arrange
    const svc = service(client(modelJson({ visible_object_count: 60 })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.objectDensity).toBe('too_many');
    expect(result.processable).toBe(true);
    expect(result.advice).toBe('A lot of items in frame — a few closer shots will work better');
  });

  it('respects a custom max-objects threshold', async () => {
    // Arrange
    const svc = service(client(modelJson({ visible_object_count: 20 })), { maxObjects: 10 });

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.objectDensity).toBe('too_many');
  });

  it('buckets density boundaries: none / few / moderate / many', async () => {
    const cases: Array<[number, string]> = [
      [0, 'none'],
      [1, 'few'],
      [5, 'few'],
      [6, 'moderate'],
      [15, 'moderate'],
      [16, 'many'],
      [35, 'many'],
    ];
    for (const [count, expected] of cases) {
      const svc = service(client(modelJson({ visible_object_count: count })));
      const result = await svc.precheck(TINY_JPEG);
      expect(result.objectDensity, `count=${count}`).toBe(expected);
    }
  });

  it('reports peoplePresent from the model verdict', async () => {
    // Arrange
    const svc = service(client(modelJson({ scene: 'person_focus', people_present: true })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.peoplePresent).toBe(true);
    expect(result.processable).toBe(false);
    expect(result.advice).toBe('Point the camera at your shelves or rooms, not people');
  });

  it('fails open on malformed model JSON', async () => {
    // Arrange
    const svc = service(client('sorry, I cannot help with that'));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.processable).toBe(true);
    expect(result.advice).toBeNull();
    expect(result.visibleObjectCount).toBeNull();
  });

  it('fails open when a required enum field is invalid', async () => {
    // Arrange
    const svc = service(client(modelJson({ scene: 'spaceship' })));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.processable).toBe(true);
    expect(result.advice).toBeNull();
  });

  it('salvages JSON wrapped in markdown fences', async () => {
    // Arrange
    const svc = service(client('```json\n' + modelJson({ scene: 'document' }) + '\n```'));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.scene).toBe('document');
    expect(result.processable).toBe(false);
  });

  it('tolerates a missing count via field-level salvage', async () => {
    // Arrange
    const svc = service(
      client(JSON.stringify({ scene: 'interior', quality: 'ok', people_present: 'nope' })),
    );

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.objectDensity).toBe('none');
    expect(result.visibleObjectCount).toBeNull();
    expect(result.peoplePresent).toBe(false);
    expect(result.processable).toBe(true);
  });

  it('fails open when the model backend is unavailable', async () => {
    // Arrange
    const svc = service(client(new DetectorUnavailableError('ollama down')));

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.processable).toBe(true);
    expect(result.advice).toBeNull();
    expect(result.visibleObjectCount).toBeNull();
  });

  it('fails open when the model call exceeds the deadline', async () => {
    // Arrange
    const svc = service(client(modelJson(), 200), { timeoutMs: 50 });

    // Act
    const result = await svc.precheck(TINY_JPEG);

    // Assert
    expect(result.processable).toBe(true);
    expect(result.advice).toBeNull();
    expect(result.visibleObjectCount).toBeNull();
  });
});

describe('buildPrecheckPrompt', () => {
  it('locks the schema to enumerated values and demands JSON only', () => {
    const prompt = buildPrecheckPrompt();
    expect(prompt).toContain('Return ONLY this JSON');
    expect(prompt).toContain('interior|exterior|person_focus|document|other');
  });

  it('recovers a verdict when a small model echoes the enum instead of choosing', () => {
    // Measured with qwen3-vl:2b-instruct, which answers "interior|room".
    const svc = new PrecheckService(
      client('{"scene":"interior|room","visible_object_count":12,"people_present":false}'),
    );
    return svc.precheck(TINY_JPEG).then((r) => {
      expect(r.scene).toBe('interior');
      expect(r.processable).toBe(true);
    });
  });

  it('fails open on a scene value that is not in the enum at all', () => {
    const svc = new PrecheckService(
      client('{"scene":"spaceship","visible_object_count":3,"people_present":false}'),
    );
    return svc.precheck(TINY_JPEG).then((r) => {
      expect(r.processable).toBe(true);
      expect(r.advice).toBeNull();
    });
  });

  it('asks only for scene, count and people — never for photo quality', () => {
    // Brightness/blur are cheap for the client to measure on the preview frame;
    // every field the model must produce is latency the user waits through.
    const prompt = buildPrecheckPrompt();
    expect(prompt).toContain('visible_object_count');
    expect(prompt).toContain('people_present');
    expect(prompt).not.toContain('too_dark');
    expect(prompt).not.toContain('too_blurry');
  });
});
