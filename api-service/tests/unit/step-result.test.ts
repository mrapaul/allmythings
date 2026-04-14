import { describe, it, expect } from 'vitest';
import { ok, fail, classifyError, isOk, isFail } from '../../src/telemetry/step-result';

describe('StepResult', () => {
  it('ok() wraps a value', () => {
    const r = ok(42, 100);
    expect(isOk(r)).toBe(true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
    expect(r.durationMs).toBe(100);
  });

  it('fail() carries a structured error', () => {
    const r = fail({ code: 'timeout', message: 'took too long', retryable: true }, 5000);
    expect(isFail(r)).toBe(true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('timeout');
      expect(r.error.retryable).toBe(true);
    }
  });
});

describe('classifyError', () => {
  it('maps AbortSignal timeout to retryable timeout', () => {
    const abortError = new DOMException('aborted', 'TimeoutError');
    const coded = classifyError(abortError);
    expect(coded.code).toBe('timeout');
    expect(coded.retryable).toBe(true);
  });

  it('maps 5xx text to retryable upstream_5xx', () => {
    const coded = classifyError(new Error('Ollama returned 500: ...'));
    expect(coded.code).toBe('upstream_5xx');
    expect(coded.retryable).toBe(true);
  });

  it('maps 4xx to non-retryable upstream_4xx', () => {
    const coded = classifyError(new Error('Ollama returned 400: bad request'));
    expect(coded.code).toBe('upstream_4xx');
    expect(coded.retryable).toBe(false);
  });

  it('maps unknown errors to unknown + retryable=false', () => {
    const coded = classifyError('random string');
    expect(coded.code).toBe('unknown');
    expect(coded.retryable).toBe(false);
  });
});
