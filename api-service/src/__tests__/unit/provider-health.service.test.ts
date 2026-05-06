import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderHealthService } from '../../services/provider-health.service';

describe('ProviderHealthService', () => {
  let svc: ProviderHealthService;

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    if (svc) svc.stop();
  });

  function build(): ProviderHealthService {
    return new ProviderHealthService({
      florenceUrl: 'http://x',
      ollamaUrl: 'http://y',
      pipelineUrl: 'http://z',
    });
  }

  it('returns unknown state before first probe', () => {
    svc = build();
    const s = svc.snapshot();
    expect(s.florence.status).toBe('unknown');
    expect(s.ollama.status).toBe('unknown');
    expect(s.pipeline.status).toBe('unknown');
  });

  it('reports up when HTTP probe returns 2xx', async () => {
    svc = build();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    await svc.probeOnce();
    const s = svc.snapshot();
    expect(s.florence.status).toBe('up');
    expect(s.ollama.status).toBe('up');
    expect(s.pipeline.status).toBe('up');
  });

  it('reports down when HTTP probe errors', async () => {
    svc = build();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('refused'));
    await svc.probeOnce();
    expect(svc.snapshot().florence.status).toBe('down');
    expect(svc.snapshot().pipeline.status).toBe('down');
  });

  it('tracks consecutive failures', async () => {
    svc = build();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('x'));
    await svc.probeOnce();
    await svc.probeOnce();
    await svc.probeOnce();
    expect(svc.snapshot().florence.consecutiveFailures).toBe(3);
    expect(svc.snapshot().pipeline.consecutiveFailures).toBe(3);
  });

  it('resets consecutive failures on a successful probe', async () => {
    svc = build();
    // Three fetches happen per probe (florence, ollama, pipeline).
    // First probe: all three fail; second probe: all three succeed.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    await svc.probeOnce();
    expect(svc.snapshot().ollama.consecutiveFailures).toBeGreaterThanOrEqual(1);
    await svc.probeOnce();
    expect(svc.snapshot().ollama.consecutiveFailures).toBe(0);
    expect(svc.snapshot().ollama.status).toBe('up');
    expect(fetchSpy).toHaveBeenCalled();
  });
});
