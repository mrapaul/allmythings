import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT ?? 'http://localhost:4317';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'api-service';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION ?? '2.0.0';

let sdk: NodeSDK | null = null;
let promExporter: PrometheusExporter | null = null;

export async function initTelemetry(): Promise<void> {
  if (sdk) return;

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  });

  promExporter = new PrometheusExporter({ preventServerStart: true });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: OTLP_ENDPOINT }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: OTLP_ENDPOINT }),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

export function getPrometheusExporter(): PrometheusExporter | null {
  return promExporter;
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
