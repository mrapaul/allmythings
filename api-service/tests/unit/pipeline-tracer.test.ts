import { describe, it, expect } from 'vitest';
import { withSpan } from '../../src/telemetry/pipeline-tracer';

describe('withSpan', () => {
  it('returns ok when step succeeds', async () => {
    const r = await withSpan('test.ok', { photoId: 'p1' }, async () => 'hello');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hello');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns fail when step throws', async () => {
    const r = await withSpan('test.fail', {}, async () => {
      throw new Error('Ollama returned 500: boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('upstream_5xx');
      expect(r.error.retryable).toBe(true);
    }
  });

  it('records span duration', async () => {
    const r = await withSpan('test.delay', {}, async () => {
      await new Promise((res) => setTimeout(res, 30));
      return 1;
    });
    expect(r.durationMs).toBeGreaterThanOrEqual(25);
  });
});
