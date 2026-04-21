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

let sdk: NodeSDK | null = null;

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

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: endpoint }),
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
 */
export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
