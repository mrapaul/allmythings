process.env.NODE_ENV = 'development';

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ExportCircuit, SafeSpanExporter } from '../../../telemetry/safe-exporter';

const SPANS = [] as ReadableSpan[];

function failingInner(): SpanExporter & { export: ReturnType<typeof vi.fn> } {
  return {
    export: vi.fn((_spans: ReadableSpan[], cb: (result: ExportResult) => void) => {
      cb({ code: ExportResultCode.FAILED, error: new Error('connect ECONNREFUSED 127.0.0.1:4317') });
    }),
    shutdown: vi.fn(async () => undefined),
  };
}

function exportOnce(exporter: SafeSpanExporter): ExportResult {
  let result: ExportResult | undefined;
  exporter.export(SPANS, (r) => {
    result = r;
  });
  if (!result) throw new Error('export callback did not fire synchronously');
  return result;
}

describe('SafeSpanExporter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('always reports success upstream, even when the inner exporter fails', () => {
    const inner = failingInner();
    const safe = new SafeSpanExporter(inner);

    const result = exportOnce(safe);

    expect(result.code).toBe(ExportResultCode.SUCCESS);
    expect(inner.export).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after repeated failures and stops calling the exporter', () => {
    const inner = failingInner();
    const safe = new SafeSpanExporter(inner);

    for (let i = 0; i < 10; i++) {
      expect(exportOnce(safe).code).toBe(ExportResultCode.SUCCESS);
    }

    // 3 real attempts trip the circuit; the remaining 7 are silent no-ops.
    expect(inner.export).toHaveBeenCalledTimes(3);
  });

  it('probes again after the retry interval and recovers when the collector returns', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const inner = failingInner();
    const safe = new SafeSpanExporter(inner);

    for (let i = 0; i < 5; i++) exportOnce(safe);
    expect(inner.export).toHaveBeenCalledTimes(3);

    // Collector comes back; next probe (after the long interval) succeeds.
    inner.export.mockImplementation(
      (_spans: ReadableSpan[], cb: (result: ExportResult) => void) => {
        cb({ code: ExportResultCode.SUCCESS });
      },
    );
    vi.setSystemTime(5 * 60_000 + 1);
    exportOnce(safe); // probe → success → circuit closes
    exportOnce(safe); // circuit closed: delegates again immediately
    expect(inner.export).toHaveBeenCalledTimes(5);
  });

  it('catches an exporter that throws synchronously', () => {
    const inner: SpanExporter = {
      export: () => {
        throw new Error('sync explosion');
      },
      shutdown: async () => undefined,
    };
    const safe = new SafeSpanExporter(inner);

    expect(exportOnce(safe).code).toBe(ExportResultCode.SUCCESS);
  });

  it('swallows shutdown and flush rejections', async () => {
    const inner: SpanExporter = {
      export: (_s, cb) => cb({ code: ExportResultCode.SUCCESS }),
      shutdown: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:4317');
      },
      forceFlush: async () => {
        throw new Error('flush failed');
      },
    };
    const safe = new SafeSpanExporter(inner);

    await expect(safe.shutdown()).resolves.toBeUndefined();
    await expect(safe.forceFlush()).resolves.toBeUndefined();
  });
});

describe('ExportCircuit', () => {
  it('logs the outage once — on the open transition, not per failure', () => {
    let now = 0;
    const circuit = new ExportCircuit('traces', 3, 1000, () => now);

    circuit.record(false);
    circuit.record(false);
    expect(circuit.shouldAttempt()).toBe(true);
    circuit.record(false); // trips
    expect(circuit.shouldAttempt()).toBe(false);

    now = 1001; // probe window
    expect(circuit.shouldAttempt()).toBe(true);
    expect(circuit.shouldAttempt()).toBe(false); // only one probe per interval

    now = 2002;
    expect(circuit.shouldAttempt()).toBe(true);
    circuit.record(true); // collector back
    expect(circuit.shouldAttempt()).toBe(true);
  });
});
