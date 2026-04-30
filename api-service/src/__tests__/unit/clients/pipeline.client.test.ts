import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPipelineClient,
  QueueFullError,
  RunNotFoundError,
  PipelineUnavailableError,
} from '../../../clients/pipeline.client';
import { CircuitBreaker } from '../../../utils/circuit-breaker';
import type { SceneObservation } from '../../../types/pipeline';

const mkBreaker = () =>
  new CircuitBreaker('test-pipeline', {
    failureThreshold: 3,
    resetTimeout: 1_000,
    halfOpenRequests: 1,
  });

const SCENE: SceneObservation = {
  sceneId: 's-1',
  runId: 'r-1',
  frameIds: ['F0', 'F1', 'F2'],
  detections: [],
  agreementCoverage: 0,
  agreementPrecision: 0,
  selfDiagnosisTriggered: false,
  rerunDepth: 0,
  flagged: false,
  processingMs: 12,
  errors: [],
  tileErrors: [],
};

interface FakeResponse {
  status: number;
  body: unknown;
}

function scriptedFetch(scripted: FakeResponse[]): typeof fetch {
  let i = 0;
  return ((_url: string | URL, _init?: RequestInit) => {
    const next = scripted[Math.min(i, scripted.length - 1)];
    i += 1;
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    } as Response);
  }) as unknown as typeof fetch;
}

describe('pipeline.client.launchRun', () => {
  it('POSTs to /runs and parses 202', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        {
          status: 202,
          body: { run_id: 'r-1', started_at: '2026-01-01T00:00:00Z', idempotent_hit: false },
        },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    const out = await client.launchRun({
      idempotencyKey: 'a'.repeat(64),
      photoPaths: ['/tmp/F0.jpg', '/tmp/F1.jpg', '/tmp/F2.jpg'],
      traceId: 'trace-1',
      requestId: 'req-1',
    });
    expect(out).toEqual({
      runId: 'r-1',
      startedAt: '2026-01-01T00:00:00Z',
      idempotentHit: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:14101/runs');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      idempotency_key: 'a'.repeat(64),
      photo_paths: ['/tmp/F0.jpg', '/tmp/F1.jpg', '/tmp/F2.jpg'],
      trace_id: 'trace-1',
      request_id: 'req-1',
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });

  it('200 idempotent_hit + status=running returns idempotentHit', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        {
          status: 200,
          body: {
            run_id: 'r-2',
            started_at: 'x',
            idempotent_hit: true,
            status: 'running',
          },
        },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    const out = await client.launchRun({
      idempotencyKey: 'b'.repeat(64),
      photoPaths: ['/tmp/F0.jpg'],
      traceId: 't',
      requestId: 'r',
    });
    expect(out.idempotentHit).toBe(true);
    expect(out.status).toBe('running');
    expect(out.result).toBeUndefined();
  });

  it('200 idempotent_hit + status=succeeded returns result', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        {
          status: 200,
          body: {
            run_id: 'r-3',
            started_at: 'x',
            idempotent_hit: true,
            status: 'succeeded',
            result: SCENE,
          },
        },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    const out = await client.launchRun({
      idempotencyKey: 'c'.repeat(64),
      photoPaths: ['/tmp/F0.jpg'],
      traceId: 't',
      requestId: 'r',
    });
    expect(out.idempotentHit).toBe(true);
    expect(out.status).toBe('succeeded');
    expect(out.result).toEqual(SCENE);
  });

  it('503 queue_full throws QueueFullError carrying retry_after_s', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        {
          status: 503,
          body: { error: 'queue_full', queue_depth: 4, retry_after_s: 7 },
        },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    await expect(
      client.launchRun({
        idempotencyKey: 'd'.repeat(64),
        photoPaths: ['/tmp/F0.jpg'],
        traceId: 't',
        requestId: 'r',
      }),
    ).rejects.toBeInstanceOf(QueueFullError);
    try {
      await client.launchRun({
        idempotencyKey: 'd'.repeat(64),
        photoPaths: ['/tmp/F0.jpg'],
        traceId: 't',
        requestId: 'r',
      });
    } catch (e) {
      const err = e as QueueFullError;
      expect(err.retryAfterS).toBe(7);
      expect(err.queueDepth).toBe(4);
    }
  });

  it('forwards trace_id + request_id via body and traceparent header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        { status: 202, body: { run_id: 'r', started_at: 'x', idempotent_hit: false } },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    await client.launchRun({
      idempotencyKey: 'e'.repeat(64),
      photoPaths: ['/tmp/F.jpg'],
      traceId: 'cafebabecafebabecafebabecafebabe',
      requestId: 'req-x',
    });
    const init = fetchImpl.mock.calls[0][1];
    const headers = init?.headers as Record<string, string>;
    expect(headers['traceparent']).toMatch(/^00-cafebabecafebabecafebabecafebabe-/);
  });
});

describe('pipeline.client.getRun', () => {
  it('GETs /runs/:id and returns RunStatus shape', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        {
          status: 200,
          body: {
            run_id: 'r-9',
            status: 'succeeded',
            started_at: 's',
            finished_at: 'f',
            result: SCENE,
          },
        },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    const out = await client.getRun('r-9');
    expect(out.runId).toBe('r-9');
    expect(out.status).toBe('succeeded');
    expect(out.startedAt).toBe('s');
    expect(out.finishedAt).toBe('f');
    expect(out.result).toEqual(SCENE);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:14101/runs/r-9');
    expect(init?.method).toBe('GET');
  });

  it('404 throws RunNotFoundError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(scriptedFetch([{ status: 404, body: {} }]));
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    await expect(client.getRun('missing')).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('5xx throws PipelineUnavailableError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(scriptedFetch([{ status: 502, body: {} }]));
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
    });
    await expect(client.getRun('r')).rejects.toBeInstanceOf(PipelineUnavailableError);
  });
});

describe('pipeline.client.waitForCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses /wait?timeout_s=N and resolves on terminal status', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        {
          status: 200,
          body: { run_id: 'r-10', status: 'succeeded', started_at: 's', result: SCENE },
        },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
      longPollTimeoutS: 25,
    });
    const p = client.waitForCompletion('r-10', Date.now() + 30_000);
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out.status).toBe('succeeded');
    expect(out.result).toEqual(SCENE);
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toBe('http://127.0.0.1:14101/runs/r-10/wait?timeout_s=25');
  });

  it('reduces timeout_s as deadline approaches; never sends 0', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        { status: 200, body: { run_id: 'r-11', status: 'running', started_at: 's' } },
        { status: 200, body: { run_id: 'r-11', status: 'running', started_at: 's' } },
        { status: 200, body: { run_id: 'r-11', status: 'succeeded', started_at: 's', result: SCENE } },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
      longPollTimeoutS: 5,
    });
    const start = Date.now();
    const p = client.waitForCompletion('r-11', start + 10_000);
    await vi.runAllTimersAsync();
    await p;
    const calls = fetchImpl.mock.calls.map((c) => String(c[0]));
    for (const u of calls) {
      const m = /timeout_s=(\d+)/.exec(u);
      expect(m).not.toBeNull();
      const n = Number(m![1]);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('returns last status running when deadline already past', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        { status: 200, body: { run_id: 'r-12', status: 'running', started_at: 's' } },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
      longPollTimeoutS: 1,
    });
    const past = Date.now() - 1;
    const out = await client.waitForCompletion('r-12', past);
    expect(out.status).toBe('running');
    expect(out.runId).toBe('r-12');
  });

  it('falls back to short-poll when /wait returns 404', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        { status: 404, body: {} },
        { status: 200, body: { run_id: 'r-13', status: 'running', started_at: 's' } },
        { status: 200, body: { run_id: 'r-13', status: 'succeeded', started_at: 's', result: SCENE } },
      ]),
    );
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: mkBreaker(),
      longPollTimeoutS: 5,
      maxRpsPerRun: 100,
    });
    const p = client.waitForCompletion('r-13', Date.now() + 10_000);
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out.status).toBe('succeeded');
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/wait');
    expect(urls[1]).toContain('/runs/r-13');
    expect(urls[1]).not.toContain('/wait');
  });
});

describe('pipeline.client circuit-breaker integration', () => {
  it('repeated 5xx opens the breaker; subsequent calls fail fast', async () => {
    const fetchImpl = vi.fn<typeof fetch>(scriptedFetch([{ status: 500, body: {} }]));
    const breaker = mkBreaker();
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: breaker,
    });
    for (let i = 0; i < 3; i += 1) {
      await expect(client.getRun('r')).rejects.toBeDefined();
    }
    const callsBeforeOpen = fetchImpl.mock.calls.length;
    await expect(client.getRun('r')).rejects.toBeInstanceOf(PipelineUnavailableError);
    expect(fetchImpl.mock.calls.length).toBe(callsBeforeOpen);
  });

  it('repeated 404 RunNotFound does NOT trip the breaker', async () => {
    const fetchImpl = vi.fn<typeof fetch>(scriptedFetch([{ status: 404, body: {} }]));
    const breaker = mkBreaker();
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: breaker,
    });
    // Hit it 5× — well past failureThreshold=3 — and assert the breaker is
    // still CLOSED (each call hit the network, not a fast-fail).
    for (let i = 0; i < 5; i += 1) {
      await expect(client.getRun('r')).rejects.toBeInstanceOf(RunNotFoundError);
    }
    expect(fetchImpl.mock.calls.length).toBe(5);
    // Final call still reaches the network and returns RunNotFoundError —
    // never the PipelineUnavailableError that would mean "breaker is OPEN".
    await expect(client.getRun('r')).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('repeated 503 queue_full does NOT trip the breaker', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      scriptedFetch([
        { status: 503, body: { error: 'queue_full', queue_depth: 4, retry_after_s: 1 } },
      ]),
    );
    const breaker = mkBreaker();
    const client = createPipelineClient({
      baseUrl: 'http://127.0.0.1:14101',
      fetchImpl,
      circuitBreaker: breaker,
    });
    for (let i = 0; i < 5; i += 1) {
      await expect(
        client.launchRun({
          idempotencyKey: 'f'.repeat(64),
          photoPaths: ['/tmp/x'],
          traceId: 't',
          requestId: 'r',
        }),
      ).rejects.toBeInstanceOf(QueueFullError);
    }
    expect(fetchImpl.mock.calls.length).toBe(5);
    await expect(
      client.launchRun({
        idempotencyKey: 'f'.repeat(64),
        photoPaths: ['/tmp/x'],
        traceId: 't',
        requestId: 'r',
      }),
    ).rejects.toBeInstanceOf(QueueFullError);
  });
});
