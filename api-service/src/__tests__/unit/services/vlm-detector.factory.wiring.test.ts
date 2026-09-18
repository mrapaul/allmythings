import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Factory wiring is env-driven, so each case re-imports the modules with
 * vi.resetModules() after pinning the relevant process.env keys (envConfig
 * parses process.env once at module load).
 */
const MANAGED_KEYS = [
  'DETECTOR',
  'PROPOSER_ENABLED',
  'PROPOSER_URL',
  'PROPOSER_TIMEOUT_MS',
  'QUALITY_VLM_URL',
  'QUALITY_VLM_MODEL',
  'QUALITY_VLM_API_KEY',
  'GEMINI_API_KEY',
] as const;

const saved: Record<string, string | undefined> = {};

async function loadFactory() {
  return import('../../../services/vlm-detector.factory');
}

describe('vlm-detector factory — quality tier + proposer wiring', () => {
  beforeEach(() => {
    for (const key of MANAGED_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.DETECTOR = 'vlm';
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of MANAGED_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.resetModules();
  });

  it('createQualityVlmDetector returns null when the quality tier is unconfigured', async () => {
    const factory = await loadFactory();
    expect(factory.createQualityVlmDetector(null)).toBeNull();
  });

  it('createQualityVlmDetector builds a detector when URL + model are set', async () => {
    process.env.QUALITY_VLM_URL = 'https://quality.example.com/v1';
    process.env.QUALITY_VLM_MODEL = 'Qwen3-VL-30B-A3B-Instruct';
    const factory = await loadFactory();
    const detector = factory.createQualityVlmDetector(null);
    expect(detector).not.toBeNull();
    expect(typeof detector!.detect).toBe('function');
    expect(typeof detector!.detectStream).toBe('function');
  });

  it('createVlmDetector returns a ProposerDetector when PROPOSER_ENABLED=true', async () => {
    process.env.PROPOSER_ENABLED = 'true';
    const factory = await loadFactory();
    const { ProposerDetector } = await import('../../../services/proposer-detector');
    const detector = factory.createVlmDetector(null);
    expect(detector).toBeInstanceOf(ProposerDetector);
  });

  it('createVlmDetector ignores PROPOSER_ENABLED when DETECTOR is not vlm', async () => {
    process.env.DETECTOR = 'pipeline';
    process.env.PROPOSER_ENABLED = 'true';
    const factory = await loadFactory();
    const { ProposerDetector } = await import('../../../services/proposer-detector');
    const detector = factory.createVlmDetector(null);
    expect(detector).not.toBeInstanceOf(ProposerDetector);
  });

  it('createVlmDetector keeps the VLM path when the proposer is disabled', async () => {
    const factory = await loadFactory();
    const { ProposerDetector } = await import('../../../services/proposer-detector');
    const detector = factory.createVlmDetector(null);
    expect(detector).not.toBeInstanceOf(ProposerDetector);
  });
});
