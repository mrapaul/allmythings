import { propagation, context } from '@opentelemetry/api';

/**
 * Injects W3C `traceparent` (and `tracestate`) headers into the provided
 * headers map using the globally-registered OpenTelemetry text-map propagator.
 *
 * When called inside an active span context the function writes a valid
 * `traceparent` header so downstream HTTP services can continue the trace.
 * When there is no active span the call is a no-op and existing headers are
 * left unchanged.
 *
 * @param headers - Mutable map of outbound HTTP headers to enrich.
 */
export function injectTraceHeaders(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers);
}
