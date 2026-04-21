import { initOtel, shutdownOtel } from './telemetry/otel-init';

/**
 * Initializes telemetry. Thin shim over {@link initOtel} so that `app.ts`'s
 * early `initTelemetry()` call site (which must run before any instrumented
 * module is imported) continues to work.
 */
export async function initTelemetry(): Promise<void> {
  initOtel();
}

/**
 * Shuts down telemetry and flushes pending spans/metrics. Retained for
 * backwards compatibility with existing tests; delegates to
 * {@link shutdownOtel}.
 */
export async function shutdownTelemetry(): Promise<void> {
  await shutdownOtel();
}
