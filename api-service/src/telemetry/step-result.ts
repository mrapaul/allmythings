/**
 * StepResult<T> — discriminated union representing the outcome of a single pipeline step.
 *
 * Replaces the `catch → return null` pattern with a structured, typed result that carries
 * either the success value or a categorised, retryable/non-retryable error.
 */

/** Categorised error codes for pipeline step failures. */
export interface StepError {
  code: 'timeout' | 'upstream_4xx' | 'upstream_5xx' | 'parse_error' | 'network' | 'ggml_assert' | 'unknown';
  message: string;
  retryable: boolean;
  cause?: unknown;
}

/**
 * Discriminated union for the result of a pipeline step.
 * Narrowing on `ok` gives access to either `value` (success) or `error` (failure).
 */
export type StepResult<T> =
  | { ok: true;  value: T;         durationMs: number }
  | { ok: false; error: StepError; durationMs: number };

/** Construct a successful StepResult. */
export function ok<T>(value: T, durationMs: number): StepResult<T> {
  return { ok: true, value, durationMs };
}

/** Construct a failed StepResult. */
export function fail<T = never>(error: StepError, durationMs: number): StepResult<T> {
  return { ok: false, error, durationMs };
}

/** Type-guard: narrows to the success variant. */
export function isOk<T>(r: StepResult<T>): r is Extract<StepResult<T>, { ok: true }> {
  return r.ok;
}

/** Type-guard: narrows to the failure variant. */
export function isFail<T>(r: StepResult<T>): r is Extract<StepResult<T>, { ok: false }> {
  return !r.ok;
}

/**
 * Classify an unknown thrown value into a structured StepError.
 *
 * Matching priority (first match wins):
 *  1. AbortError / TimeoutError  → timeout (retryable)
 *  2. GGML_ASSERT in message     → ggml_assert (retryable)
 *  3. "returned/status 5xx"      → upstream_5xx (retryable)
 *  4. "returned/status 4xx"      → upstream_4xx (not retryable)
 *  5. TypeError with "fetch"     → network (retryable)
 *  6. "JSON" or "parse" in msg   → parse_error (not retryable)
 *  7. everything else            → unknown (not retryable)
 */
export function classifyError(err: unknown): StepError {
  const msg = err instanceof Error ? err.message : String(err);

  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { code: 'timeout', message: msg, retryable: true, cause: err };
  }

  if (/GGML_ASSERT/.test(msg)) {
    return { code: 'ggml_assert', message: msg, retryable: true, cause: err };
  }

  if (/(?:returned|status)\s+(5\d\d)/i.test(msg)) {
    return { code: 'upstream_5xx', message: msg, retryable: true, cause: err };
  }

  if (/(?:returned|status)\s+(4\d\d)/i.test(msg)) {
    return { code: 'upstream_4xx', message: msg, retryable: false, cause: err };
  }

  if (err instanceof TypeError && /fetch/i.test(msg)) {
    return { code: 'network', message: msg, retryable: true, cause: err };
  }

  if (/JSON|parse/i.test(msg)) {
    return { code: 'parse_error', message: msg, retryable: false, cause: err };
  }

  return { code: 'unknown', message: msg, retryable: false, cause: err };
}
