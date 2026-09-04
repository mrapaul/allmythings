import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  Aggregation,
  AggregationTemporality,
  type InstrumentType,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import { logger } from '../utils/logger';

/**
 * Circuit-breaking wrappers around the OTLP gRPC exporters.
 *
 * Incident driver: with the observability stack off, the raw exporters fail
 * every export with `connect ECONNREFUSED 127.0.0.1:4317`, surfacing as
 * unhandled rejections and a shutdown flush that never resolves — telemetry
 * being down took user work down with it. Telemetry is a bonus layer; these
 * wrappers make a missing collector completely harmless:
 *  - every delegate call (export/flush/shutdown) is caught, never thrown;
 *  - after a few consecutive failures the circuit opens and exports become
 *    silent no-ops, so a dead collector is not hammered every 15s;
 *  - while open, one probe export per long interval retries quietly in the
 *    background and closes the circuit when the collector returns;
 *  - upstream (batch processor / metric reader) is always told "success" so
 *    the SDK never escalates, retries, or logs collector outages itself.
 */

const FAILURE_THRESHOLD = 3;
const RETRY_INTERVAL_MS = 5 * 60_000;

export class ExportCircuit {
  private consecutiveFailures = 0;
  private disabled = false;
  private nextProbeAt = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number = FAILURE_THRESHOLD,
    private readonly retryIntervalMs: number = RETRY_INTERVAL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the delegate should be tried (closed circuit, or a due probe). */
  shouldAttempt(): boolean {
    if (!this.disabled) return true;
    if (this.now() < this.nextProbeAt) return false;
    this.nextProbeAt = this.now() + this.retryIntervalMs;
    return true;
  }

  record(success: boolean, error?: unknown): void {
    if (success) {
      if (this.disabled) {
        logger.info({ exporter: this.name }, 'otel_exporter_recovered');
      }
      this.disabled = false;
      this.consecutiveFailures = 0;
      return;
    }
    this.consecutiveFailures += 1;
    // Log once per outage, on the transition — never per failed export.
    if (!this.disabled && this.consecutiveFailures >= this.failureThreshold) {
      this.disabled = true;
      this.nextProbeAt = this.now() + this.retryIntervalMs;
      logger.warn(
        { exporter: this.name, err: describeError(error), retryInMs: this.retryIntervalMs },
        'otel_exporter_disabled_collector_unreachable',
      );
    }
  }
}

export class SafeSpanExporter implements SpanExporter {
  constructor(
    private readonly inner: SpanExporter,
    private readonly circuit: ExportCircuit = new ExportCircuit('traces'),
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    guardedExport(this.circuit, (items, cb) => this.inner.export(items, cb), spans, resultCallback);
  }

  async shutdown(): Promise<void> {
    await swallow('traces_shutdown', () => this.inner.shutdown());
  }

  async forceFlush(): Promise<void> {
    await swallow('traces_flush', () => this.inner.forceFlush?.() ?? Promise.resolve());
  }
}

export class SafeMetricExporter implements PushMetricExporter {
  constructor(
    private readonly inner: PushMetricExporter,
    private readonly circuit: ExportCircuit = new ExportCircuit('metrics'),
  ) {}

  export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
    guardedExport(
      this.circuit,
      (items, cb) => this.inner.export(items, cb),
      metrics,
      resultCallback,
    );
  }

  /** Delegate so the wrapper never changes what the inner exporter negotiated. */
  selectAggregationTemporality(instrumentType: InstrumentType): AggregationTemporality {
    return (
      this.inner.selectAggregationTemporality?.(instrumentType) ?? AggregationTemporality.CUMULATIVE
    );
  }

  selectAggregation(instrumentType: InstrumentType): Aggregation {
    return this.inner.selectAggregation?.(instrumentType) ?? Aggregation.Default();
  }

  async shutdown(): Promise<void> {
    await swallow('metrics_shutdown', () => this.inner.shutdown());
  }

  async forceFlush(): Promise<void> {
    await swallow('metrics_flush', () => this.inner.forceFlush());
  }
}

// ---------------------------------------------------------------------------

function guardedExport<T>(
  circuit: ExportCircuit,
  delegate: (items: T, cb: (result: ExportResult) => void) => void,
  items: T,
  resultCallback: (result: ExportResult) => void,
): void {
  if (!circuit.shouldAttempt()) {
    resultCallback({ code: ExportResultCode.SUCCESS });
    return;
  }
  try {
    delegate(items, (result) => {
      circuit.record(result.code === ExportResultCode.SUCCESS, result.error);
      // Always report success upstream: a missing collector must stay silent.
      resultCallback({ code: ExportResultCode.SUCCESS });
    });
  } catch (err: unknown) {
    circuit.record(false, err);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }
}

async function swallow(operation: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    logger.warn({ operation, err: describeError(err) }, 'otel_exporter_call_failed_ignored');
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return 'unknown error';
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
