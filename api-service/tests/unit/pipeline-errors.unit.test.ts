import { describe, it, expect } from 'vitest';
import { DetectionPipelineService } from '../../src/services/detection-pipeline.service';
import { MultiPassVlmClassifier } from '../../src/services/multi-pass-vlm.classifier';

describe('DetectionPipelineService error surfacing', () => {
  it('populates errors[] when the deep pass throws', async () => {
    const throwingMultiPass = {
      detect: async () => { throw new Error('Ollama returned 500: simulated'); },
    } as unknown as MultiPassVlmClassifier;

    const pipeline = new DetectionPipelineService({
      fastDetectorUrl: 'http://127.0.0.1:1',
      multiPassVlm: throwingMultiPass,
      classifiers: [],
      detectors: [],
    });

    const result = await pipeline.detectFull(Buffer.from([0xff, 0xd8, 0xff]), 'test-photo');
    expect(result.deepPass).toBeNull();
    expect(result.fastPass).toBeNull();
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const deepErr = result.errors.find((e) => e.step === 'deep_pass');
    expect(deepErr).toBeDefined();
    expect(deepErr?.code).toBe('upstream_5xx');
    expect(deepErr?.retryable).toBe(true);
  });
});
