import { SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import Constants from 'expo-constants';

let initialized = false;

/**
 * Initialize the OpenTelemetry JS SDK for the mobile app. Reads the OTLP/HTTP
 * collector URL from `Constants.expoConfig.extra.otelCollectorUrl`. If no
 * collector is configured (e.g., local dev / tests) this is a no-op so import
 * sites can call it unconditionally.
 *
 * Idempotent — repeated calls after the first are ignored.
 */
export function initOtel(): void {
  if (initialized) return;
  const collector = (Constants.expoConfig?.extra as { otelCollectorUrl?: string } | undefined)
    ?.otelCollectorUrl;
  if (!collector) return;
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  const provider = new WebTracerProvider();
  // `addSpanProcessor` is the deprecated path in 1.x but the only one
  // available across the 1.30 SDK we ship; the constructor-based
  // `spanProcessors` arg only lands in 2.x.
  provider.addSpanProcessor(
    new BatchSpanProcessor(new OTLPTraceExporter({ url: `${collector}/v1/traces` })),
  );
  provider.register();
  initialized = true;
}

/**
 * Run `fn` inside a new span named `name`, propagating the active OTel
 * context so child spans + traceparent headers chain correctly. Records
 * exceptions and ends the span on every code path.
 */
export function withSpan<T>(name: string, fn: (ctx: { spanId: string }) => Promise<T>): Promise<T> {
  const tracer = trace.getTracer('mobile-app');
  const span = tracer.startSpan(name);
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const out = await fn({ spanId: span.spanContext().spanId });
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
