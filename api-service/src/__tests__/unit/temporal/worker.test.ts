import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Capture the options passed to Worker.create so we can assert them
const capturedOptions: any[] = [];
const mockWorkerInstance = {
  options: {},
  run: vi.fn(async () => undefined),
  shutdown: vi.fn(),
};
const mockNativeConnection = { close: vi.fn(async () => undefined) };

vi.mock('@temporalio/worker', () => ({
  Worker: {
    create: vi.fn(async (opts: any) => {
      capturedOptions.push(opts);
      return { ...mockWorkerInstance, options: opts };
    }),
  },
  NativeConnection: {
    connect: vi.fn(async () => mockNativeConnection),
  },
}));

import { createWorker, closeWorker } from '../../../temporal/worker';

describe('TemporalWorker bootstrap', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await closeWorker();
  });

  it('creates a worker bound to the inventory-pipeline task queue', async () => {
    const worker = await createWorker();
    expect(worker.options.taskQueue).toBe('inventory-pipeline');
  });

  it('respects PIPELINE_MAX_CONCURRENCY for activity concurrency', async () => {
    process.env.PIPELINE_MAX_CONCURRENCY = '1';
    // Force re-import of env to reflect the env var change
    vi.resetModules();
    const { createWorker: freshCreate } = await import('../../../temporal/worker');
    const worker = await freshCreate();
    expect(worker.options.maxConcurrentActivityTaskExecutions).toBe(1);
    delete process.env.PIPELINE_MAX_CONCURRENCY;
  });

  it('uses TEMPORAL_HOST for NativeConnection.connect', async () => {
    const { NativeConnection } = await import('@temporalio/worker');
    await createWorker();
    expect(NativeConnection.connect).toHaveBeenCalledWith(expect.objectContaining({
      address: 'localhost:7233',
    }));
  });

  it('returns the same worker on repeated createWorker calls', async () => {
    const first = await createWorker();
    const second = await createWorker();
    expect(first).toBe(second);
  });
});
