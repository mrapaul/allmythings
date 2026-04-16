import { describe, it, expect, vi } from 'vitest';
import { PipelineExecutor, PipelineStep } from '../../services/pipeline-executor';

describe('PipelineExecutor', () => {
  it('runs steps in sequence and returns final context', async () => {
    const steps: PipelineStep[] = [
      { name: 'step-a', fn: async (ctx) => ({ ...ctx, a: 1 }), retry: 0, timeoutMs: 5000 },
      { name: 'step-b', fn: async (ctx) => ({ ...ctx, b: 2 }), retry: 0, timeoutMs: 5000 },
    ];

    const result = await PipelineExecutor.run('test-pipeline', steps, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context).toEqual({ a: 1, b: 2 });
      expect(result.errors).toEqual([]);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].name).toBe('step-a');
      expect(result.steps[0].ok).toBe(true);
    }
  });

  it('retries a failing step up to retry count', async () => {
    let attempts = 0;
    const steps: PipelineStep[] = [
      {
        name: 'flaky',
        fn: async (ctx) => {
          attempts++;
          if (attempts < 3) throw new Error('transient');
          return { ...ctx, done: true };
        },
        retry: 2,
        timeoutMs: 5000,
      },
    ];

    const result = await PipelineExecutor.run('retry-test', steps, {});
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('continues on step failure when onStepError is continue', async () => {
    const steps: PipelineStep[] = [
      { name: 'fail-step', fn: async () => { throw new Error('boom'); }, retry: 0, timeoutMs: 5000 },
      { name: 'ok-step', fn: async (ctx) => ({ ...ctx, ok: true }), retry: 0, timeoutMs: 5000 },
    ];

    const result = await PipelineExecutor.run('continue-test', steps, {}, 'continue');
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].step).toBe('fail-step');
    if (result.ok) {
      expect(result.context).toEqual({ ok: true });
    }
  });

  it('aborts on step failure when onStepError is abort', async () => {
    const steps: PipelineStep[] = [
      { name: 'fail-step', fn: async () => { throw new Error('boom'); }, retry: 0, timeoutMs: 5000 },
      { name: 'never-runs', fn: async (ctx) => ({ ...ctx, ran: true }), retry: 0, timeoutMs: 5000 },
    ];

    const result = await PipelineExecutor.run('abort-test', steps, {}, 'abort');
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('times out a slow step', async () => {
    const steps: PipelineStep[] = [
      {
        name: 'slow',
        fn: async (ctx) => {
          await new Promise((r) => setTimeout(r, 5000));
          return ctx;
        },
        retry: 0,
        timeoutMs: 50,
      },
    ];

    const result = await PipelineExecutor.run('timeout-test', steps, {}, 'abort');
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('timeout');
  });

  it('records durationMs per step', async () => {
    const steps: PipelineStep[] = [
      {
        name: 'delay',
        fn: async (ctx) => {
          await new Promise((r) => setTimeout(r, 50));
          return { ...ctx, done: true };
        },
        retry: 0,
        timeoutMs: 5000,
      },
    ];

    const result = await PipelineExecutor.run('timing-test', steps, {});
    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(40);
  });
});
