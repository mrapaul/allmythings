import { describe, it, expect } from 'vitest';
import type { FullPipelineResult } from '../../src/services/detection-pipeline.service';

describe('FullPipelineResult contract', () => {
  it('includes an errors array that route handlers forward', () => {
    const sample: FullPipelineResult = {
      fastPass: null,
      deepPass: null,
      fused: [],
      totalProcessingMs: 42,
      errors: [{ step: 'deep_pass', code: 'upstream_5xx', message: 'Ollama 500', retryable: true }],
    };
    expect(sample.errors).toHaveLength(1);
    expect(sample.errors[0].code).toBe('upstream_5xx');
    expect(sample.errors[0].step).toBe('deep_pass');
    expect(sample.errors[0].retryable).toBe(true);
  });
});
