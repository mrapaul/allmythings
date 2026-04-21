import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderHealthService } from '../../services/provider-health.service';

describe('ProviderHealthService', () => {
  let svc: ProviderHealthService;

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    if (svc) svc.stop();
  });

  it('returns unknown state before first probe', () => {
    svc = new ProviderHealthService({
      florenceUrl: 'http://x',
      ollamaUrl: 'http://y',
      temporalHost: 'x:7233',
    });
    const s = svc.snapshot();
    expect(s.florence.status).toBe('unknown');
    expect(s.ollama.status).toBe('unknown');
    expect(s.temporal.status).toBe('unknown');
  });

  it('reports up when HTTP probe returns 2xx', async () => {
    svc = new ProviderHealthService({
      florenceUrl: 'http://x',
      ollamaUrl: 'http://y',
      temporalHost: 'x:7233',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    await svc.probeOnce();
    const s = svc.snapshot();
    expect(s.florence.status).toBe('up');
    expect(s.ollama.status).toBe('up');
  });

  it('reports down when HTTP probe errors', async () => {
    svc = new ProviderHealthService({
      florenceUrl: 'http://x',
      ollamaUrl: 'http://y',
      temporalHost: 'x:7233',
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('refused'));
    await svc.probeOnce();
    expect(svc.snapshot().florence.status).toBe('down');
  });

  it('tracks consecutive failures', async () => {
    svc = new ProviderHealthService({
      florenceUrl: 'http://x',
      ollamaUrl: 'http://y',
      temporalHost: 'x:7233',
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'));
    await svc.probeOnce();
    await svc.probeOnce();
    await svc.probeOnce();
    expect(svc.snapshot().florence.consecutiveFailures).toBe(3);
  });

  it('resets consecutive failures on a successful probe', async () => {
    svc = new ProviderHealthService({
      florenceUrl: 'http://x',
      ollamaUrl: 'http://y',
      temporalHost: 'x:7233',
    });
    // Ollama is deterministic — each probe calls fetch exactly once for ollama.
    // Florence also calls fetch; we'll sequence mocks so ollama sees fail then success.
    // Simpler: mock fetch to reject for first call, resolve for rest.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    // First probe — both florence + ollama fetches fail
    await svc.probeOnce();
    expect(svc.snapshot().ollama.consecutiveFailures).toBeGreaterThanOrEqual(1);
    // Second probe — both fetches now succeed; ollama should reset to 0
    await svc.probeOnce();
    expect(svc.snapshot().ollama.consecutiveFailures).toBe(0);
    expect(svc.snapshot().ollama.status).toBe('up');
    expect(fetchSpy).toHaveBeenCalled();
  });
});
