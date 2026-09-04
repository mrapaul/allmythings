import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { SafeMetricExporter, SafeSpanExporter } from './safe-exporter';
import { logger } from '../utils/logger';

let sdk: NodeSDK | null = null;

/** Hard cap on the final flush: telemetry must never stall process exit. */
const SHUTDOWN_TIMEOUT_MS = 3_000;

/**
 * Bootstraps the OpenTelemetry Node SDK with OTLP gRPC exporters for traces
 * and metrics. Must be invoked before any instrumented module (HTTP server,
 * Temporal client, etc.) is imported so that auto-instrumentations can
 * monkey-patch them.
 *
 * Idempotent: repeated calls are no-ops.
 */
export function initOtel(): void {
  if (sdk) return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'api-service';
  const serviceVersion = process.env.OTEL_SERVICE_VERSION ?? '3.0.0';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_SERVICE_NAMESPACE]: 'allmythings',
  });

  // Both exporters are wrapped in circuit breakers (see safe-exporter.ts):
  // a collector that is down or never started must be completely harmless —
  // no unhandled rejections, no per-export noise, quiet background probes.
  sdk = new NodeSDK({
    resource,
    traceExporter: new SafeSpanExporter(new OTLPTraceExporter({ url: endpoint })),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new SafeMetricExporter(new OTLPMetricExporter({ url: endpoint })),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation is very noisy and adds no value for our traces.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/**
 * Flushes pending telemetry and shuts down the Node SDK. Called from the
 * server's SIGTERM/SIGINT handler so in-flight spans and metrics are exported
 * before the process exits.
 *
 * NEVER throws and NEVER hangs: with the collector down, `sdk.shutdown()`'s
 * final flush used to reject with `connect ECONNREFUSED 127.0.0.1:4317`,
 * killing the shutdown promise chain before `process.exit(0)` ran (log
 * evidence: "Unhandled Rejection" right after "Shutting down"). A failed
 * telemetry flush is logged and forgotten.
 */
export async function shutdownOtel(): Promise<void> {
  if (!sdk) return;
  const closing = sdk;
  sdk = null;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      closing.shutdown(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`otel shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms`)),
          SHUTDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'otel_shutdown_failed_ignored',
    );
  } finally {
    clearTimeout(timer);
  }
}
