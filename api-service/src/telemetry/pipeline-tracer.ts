import { trace, SpanStatusCode, Attributes } from '@opentelemetry/api';
import { StepResult, ok, fail, classifyError } from './step-result';

const tracer = trace.getTracer('detection-pipeline');

/**
 * Wraps an async pipeline step in an OpenTelemetry span and returns a StepResult<T>.
 *
 * Records span duration, sets appropriate span status on success or failure,
 * and uses classifyError to produce a structured, categorised StepError on throw.
 *
 * @param name       - OTel span name (e.g. "vlm.describe")
 * @param attributes - Span attributes attached at span creation
 * @param fn         - Async step to execute inside the span
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<StepResult<T>> {
  const span = tracer.startSpan(name, { attributes });
  const start = Date.now();
  try {
    const value = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return ok(value, Date.now() - start);
  } catch (err) {
    const coded = classifyError(err);
    span.recordException(err instanceof Error ? err : new Error(coded.message));
    span.setAttribute('error.code', coded.code);
    span.setAttribute('error.retryable', coded.retryable);
    span.setStatus({ code: SpanStatusCode.ERROR, message: coded.message });
    return fail(coded, Date.now() - start);
  } finally {
    span.end();
  }
}
