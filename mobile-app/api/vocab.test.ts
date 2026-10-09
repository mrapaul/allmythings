import { afterEach, describe, expect, it } from 'vitest';
import {
  DETECT_VOCAB_LIMIT,
  appendDetectVocab,
  clearDetectVocabProvider,
  resolveDetectVocab,
  setDetectVocabProvider,
} from './vocab';

describe('detect vocab provider', () => {
  afterEach(() => {
    clearDetectVocabProvider();
  });

  it('resolves labels through the registered provider', async () => {
    setDetectVocabProvider(async () => ['sofa', 'Lamp']);
    await expect(resolveDetectVocab()).resolves.toEqual(['sofa', 'Lamp']);
  });

  it('caps the vocabulary at the server limit (120)', async () => {
    setDetectVocabProvider(async () => Array.from({ length: 150 }, (_, i) => `item-${i}`));
    const labels = await resolveDetectVocab();
    expect(labels).toHaveLength(DETECT_VOCAB_LIMIT);
    expect(labels[0]).toBe('item-0');
    expect(labels.at(-1)).toBe('item-119');
  });

  it('fails open to [] when the provider throws — dispatch must never block', async () => {
    setDetectVocabProvider(async () => {
      throw new Error('db locked');
    });
    await expect(resolveDetectVocab()).resolves.toEqual([]);
  });

  it('resolves to [] with no provider (tests, un-wired roots)', async () => {
    await expect(resolveDetectVocab()).resolves.toEqual([]);
  });

  it('re-resolves per call so dispatch-time changes are reflected', async () => {
    let labels = ['sofa'];
    setDetectVocabProvider(async () => labels);
    await expect(resolveDetectVocab()).resolves.toEqual(['sofa']);
    labels = ['sofa', 'drill'];
    await expect(resolveDetectVocab()).resolves.toEqual(['sofa', 'drill']);
  });
});

describe('appendDetectVocab', () => {
  it('appends the vocabulary as a JSON multipart field', () => {
    const form = new FormData();
    appendDetectVocab(form, ['sofa', 'Lamp']);
    expect(JSON.parse(form.get('vocab') as string)).toEqual(['sofa', 'Lamp']);
  });

  it('omits the field entirely for an empty vocabulary', () => {
    const form = new FormData();
    appendDetectVocab(form, []);
    expect(form.get('vocab')).toBeNull();
  });
});
