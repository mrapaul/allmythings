import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaClassifier } from '../../providers/ollama.classifier';
import { BoundingBoxResult } from '../../providers/detector.interface';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const config = {
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5-vl:7b',
  ollamaEnabled: true,
  classificationTimeoutMs: 15000,
  classificationMinConfidence: 0.5,
} as any;

const sampleDetections: BoundingBoxResult[] = [
  { box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, coarseLabel: 'furniture', confidence: 0.85 },
];

const sampleVlmJson = JSON.stringify([{
  box_index: 0, label: 'wooden desk', category: 'office furniture',
  brand: null, model: null, colors: ['brown'], materials: ['wood'],
  condition: 'good', estimated_value_usd: { low: 100, high: 200 },
  description: 'Solid wood office desk', confidence: 0.88,
}]);

describe('OllamaClassifier', () => {
  let classifier: OllamaClassifier;

  beforeEach(() => {
    classifier = new OllamaClassifier(config);
    vi.clearAllMocks();
  });

  it('should extract JSON from mixed Ollama text output', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: `Here are the objects:\n${sampleVlmJson}\nDone.` }),
    });

    const results = await classifier.classify(Buffer.from('img'), sampleDetections);
    expect(results).toHaveLength(1);
    expect(results[0].label.toLowerCase()).toBe('wooden desk');
    expect(results[0].boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('should call /api/tags for health check', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) });
    expect(await classifier.healthCheck()).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tags'),
      expect.any(Object),
    );
  });

  it('should return false for health check when Ollama is down', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await classifier.healthCheck()).toBe(false);
  });
});
