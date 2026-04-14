import { describe, it, expect } from 'vitest';
import { trace, context, propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { injectTraceHeaders } from '../../src/telemetry/trace-context';

// Register a real async context manager so context.with() correctly propagates
// span context within the callback. The default NoopContextManager discards it.
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

// Register a real SDK tracer provider so spans have valid 128-bit trace IDs
// and 64-bit span IDs that the W3C propagator can serialise into traceparent.
const provider = new BasicTracerProvider();
provider.register();

// Register W3C propagator globally so propagation.inject writes traceparent headers.
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

describe('injectTraceHeaders', () => {
  it('adds traceparent when a span is active', async () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('t');
    const ctx = trace.setSpan(context.active(), span);
    const headers: Record<string, string> = {};
    context.with(ctx, () => injectTraceHeaders(headers));
    span.end();
    expect(headers.traceparent).toMatch(/^\d{2}-[0-9a-f]{32}-[0-9a-f]{16}-\d{2}$/);
  });

  it('is a no-op when no active span', () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    injectTraceHeaders(headers);
    expect(headers.traceparent).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });
});
