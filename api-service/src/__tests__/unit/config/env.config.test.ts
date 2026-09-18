import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * envConfig is parsed once at module load, so each case re-imports the module
 * with vi.resetModules() after pinning the relevant process.env keys.
 */
const MANAGED_KEYS = [
  'VLM_TIMEOUT_MS',
  'QUALITY_VLM_URL',
  'QUALITY_VLM_MODEL',
  'QUALITY_VLM_API_KEY',
  'QUALITY_VLM_TIMEOUT_MS',
  'PROPOSER_ENABLED',
  'PROPOSER_URL',
  'PROPOSER_TIMEOUT_MS',
] as const;

const saved: Record<string, string | undefined> = {};

async function loadConfig() {
  const mod = await import('../../../config/env.config');
  return mod.envConfig;
}

describe('env.config — quality tier + proposer knobs', () => {
  beforeEach(() => {
    for (const key of MANAGED_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of MANAGED_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.resetModules();
  });

  it('quality tier defaults to unconfigured', async () => {
    const envConfig = await loadConfig();
    expect(envConfig.qualityVlmUrl).toBe('');
    expect(envConfig.qualityVlmModel).toBe('');
    expect(envConfig.qualityVlmApiKey).toBe('');
  });

  it('quality tier timeout defaults to VLM_TIMEOUT_MS, then its own env', async () => {
    let envConfig = await loadConfig();
    expect(envConfig.qualityVlmTimeoutMs).toBe(300000);

    vi.resetModules();
    process.env.VLM_TIMEOUT_MS = '450000';
    envConfig = await loadConfig();
    expect(envConfig.qualityVlmTimeoutMs).toBe(450000);

    vi.resetModules();
    process.env.QUALITY_VLM_TIMEOUT_MS = '600000';
    envConfig = await loadConfig();
    expect(envConfig.qualityVlmTimeoutMs).toBe(600000);
  });

  it('parses the quality tier env vars when set', async () => {
    process.env.QUALITY_VLM_URL = 'https://quality.example.com/v1';
    process.env.QUALITY_VLM_MODEL = 'Qwen3-VL-30B-A3B-Instruct';
    process.env.QUALITY_VLM_API_KEY = 'secret';
    const envConfig = await loadConfig();
    expect(envConfig.qualityVlmUrl).toBe('https://quality.example.com/v1');
    expect(envConfig.qualityVlmModel).toBe('Qwen3-VL-30B-A3B-Instruct');
    expect(envConfig.qualityVlmApiKey).toBe('secret');
  });

  it('proposer defaults to disabled with the documented sidecar defaults', async () => {
    const envConfig = await loadConfig();
    expect(envConfig.proposerEnabled).toBe(false);
    expect(envConfig.proposerUrl).toBe('http://127.0.0.1:8001');
    expect(envConfig.proposerTimeoutMs).toBe(30000);
  });

  it('parses proposer env when enabled', async () => {
    process.env.PROPOSER_ENABLED = 'true';
    process.env.PROPOSER_URL = 'http://10.0.0.5:8001';
    process.env.PROPOSER_TIMEOUT_MS = '45000';
    const envConfig = await loadConfig();
    expect(envConfig.proposerEnabled).toBe(true);
    expect(envConfig.proposerUrl).toBe('http://10.0.0.5:8001');
    expect(envConfig.proposerTimeoutMs).toBe(45000);
  });
});
